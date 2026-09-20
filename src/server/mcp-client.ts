import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ConsoleEvent, JsonObject, McpToolDefinition, ToolResult } from "../shared/types.js";
import { redactSecrets } from "./security.js";

export const EXPECTED_MCP_TOOLS = [
  "search",
  "get_endpoint_schema",
  "call_endpoint",
  "get_endpoint_item",
  "get_choices",
  "get_counts",
  "get_more_results",
  "read_document",
  "search_document",
  "extract_citations",
  "analyze_citations",
  "resume_citation_analysis",
  "create_search_alert",
  "delete_search_alert",
  "subscribe_to_docket_alert",
  "unsubscribe_from_docket_alert",
  "pray_for_document",
  "withdraw_prayer",
  "get_api_usage",
] as const;

export const STATE_CHANGING_TOOLS = new Set([
  "create_search_alert",
  "delete_search_alert",
  "subscribe_to_docket_alert",
  "unsubscribe_from_docket_alert",
  "pray_for_document",
  "withdraw_prayer",
]);

function normalizeResult(result: unknown): unknown {
  const value = result as {
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (value?.structuredContent !== undefined) return value.structuredContent;
  const textParts = value?.content?.filter((item) => item.type === "text").map((item) => item.text ?? "") ?? [];
  if (textParts.length === 1) {
    try {
      return JSON.parse(textParts[0]);
    } catch {
      return textParts[0];
    }
  }
  return textParts.length ? textParts.join("\n") : result;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSecrets(message).slice(0, 1200);
}

export function courtListenerRetryDelayMs(error: unknown): number | null {
  const message = safeError(error);
  if (!/429|rate limit|throttled/i.test(message)) return null;
  if (/\b\d+\s*\/\s*(?:hour|day)\b|per (?:hour|day)|hourly|daily limit/i.test(message)) return null;
  if (/\b\d+\s*\/\s*min\b|per minute|minute limit/i.test(message)) return 61_000;
  const seconds = Number(message.match(/(?:available|try again|retry)[^\d]{0,30}(\d+)\s*seconds?/i)?.[1]);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(75_000, (seconds + 8) * 1_000)
    : 30_000;
}

export interface McpClientOptions {
  endpoint: string;
  timeoutMs: number;
  getToken: () => Promise<string | null>;
}

export class CourtListenerMcpClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private connectedToken: string | null = null;
  private connecting: Promise<void> | null = null;
  private toolsCache: McpToolDefinition[] = [];
  private readonly events: ConsoleEvent[] = [];
  private lastSuccess: string | null = null;
  private lastError: string | null = null;
  private retryQueue: Promise<void> = Promise.resolve();
  private nextRetryAt = 0;

  constructor(private readonly options: McpClientOptions) {}

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), this.options.timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async createConnected(token: string): Promise<{
    client: Client;
    transport: StreamableHTTPClientTransport;
    tools: McpToolDefinition[];
  }> {
    const client = new Client(
      { name: "courtlistenerdash", version: "1.0.0" },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(new URL(this.options.endpoint), {
      requestInit: { headers: { Authorization: `Token ${token}` } },
    });
    try {
      await this.withTimeout(client.connect(transport), "CourtListener MCP connection");
      const listed = await this.withTimeout(client.listTools(), "CourtListener MCP tool inventory");
      return {
        client,
        transport,
        tools: listed.tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema as JsonObject,
          outputSchema: tool.outputSchema as JsonObject | undefined,
          annotations: tool.annotations as McpToolDefinition["annotations"],
        })),
      };
    } catch (error) {
      await transport.close().catch(() => undefined);
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  private async ensureConnected(): Promise<Client> {
    const token = await this.options.getToken();
    if (!token) throw new Error("CourtListener credential is not configured");
    if (this.client && this.connectedToken === token) return this.client;
    if (this.connecting) {
      await this.connecting;
      if (!this.client) throw new Error("CourtListener MCP connection failed");
      return this.client;
    }
    this.connecting = (async () => {
      await this.disconnect();
      const connected = await this.createConnected(token);
      this.client = connected.client;
      this.transport = connected.transport;
      this.toolsCache = connected.tools;
      this.connectedToken = token;
      this.lastError = null;
    })();
    try {
      await this.connecting;
    } catch (error) {
      this.lastError = safeError(error);
      throw error;
    } finally {
      this.connecting = null;
    }
    if (!this.client) throw new Error("CourtListener MCP connection failed");
    return this.client;
  }

  async disconnect(): Promise<void> {
    const transport = this.transport;
    const client = this.client;
    this.client = null;
    this.transport = null;
    this.connectedToken = null;
    this.toolsCache = [];
    if (transport) await transport.close().catch(() => undefined);
    if (client) await client.close().catch(() => undefined);
  }

  async testCredential(token: string): Promise<{ toolCount: number; tools: McpToolDefinition[] }> {
    const connected = await this.createConnected(token);
    try {
      const result = await this.withTimeout(
        connected.client.callTool({ name: "get_api_usage", arguments: {} }),
        "CourtListener credential validation",
      );
      if ((result as { isError?: boolean }).isError) throw new Error("CourtListener rejected the credential");
      return { toolCount: connected.tools.length, tools: connected.tools };
    } finally {
      await connected.transport.close().catch(() => undefined);
      await connected.client.close().catch(() => undefined);
    }
  }

  async listTools(force = false): Promise<McpToolDefinition[]> {
    if (!force && this.toolsCache.length) return this.toolsCache;
    const client = await this.ensureConnected();
    const listed = await this.withTimeout(client.listTools(), "CourtListener MCP tool inventory");
    this.toolsCache = listed.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema as JsonObject,
      outputSchema: tool.outputSchema as JsonObject | undefined,
      annotations: tool.annotations as McpToolDefinition["annotations"],
    }));
    return this.toolsCache;
  }

  async call(tool: string, args: JsonObject): Promise<ToolResult> {
    const event: ConsoleEvent = {
      id: randomUUID(),
      tool,
      arguments: redactSecrets(structuredClone(args)),
      startedAt: new Date().toISOString(),
      stateChanging: STATE_CHANGING_TOOLS.has(tool),
    };
    this.events.unshift(event);
    if (this.events.length > 200) this.events.length = 200;
    const started = performance.now();
    try {
      const client = await this.ensureConnected();
      const tools = await this.listTools();
      if (!tools.some((item) => item.name === tool)) throw new Error(`MCP tool is not available: ${tool}`);
      let raw: unknown;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          raw = await this.withTimeout(
            client.callTool({ name: tool, arguments: args }),
            `CourtListener MCP tool ${tool}`,
          );
          if ((raw as { isError?: boolean }).isError) throw new Error(String(normalizeResult(raw)));
          break;
        } catch (error) {
          const retryDelay = courtListenerRetryDelayMs(error);
          if (attempt >= 3 || retryDelay === null || STATE_CHANGING_TOOLS.has(tool)) throw error;
          event.retryCount = (event.retryCount ?? 0) + 1;
          await this.waitForRetrySlot(retryDelay);
        }
      }
      if (raw === undefined) throw new Error(`CourtListener MCP tool ${tool} returned no response`);
      const durationMs = Math.round(performance.now() - started);
      const data = normalizeResult(raw);
      event.result = redactSecrets(structuredClone(data));
      event.durationMs = durationMs;
      this.lastSuccess = new Date().toISOString();
      this.lastError = null;
      return {
        tool,
        data,
        raw: redactSecrets(raw),
        durationMs,
        calledAt: this.lastSuccess,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      event.error = safeError(error);
      event.durationMs = durationMs;
      this.lastError = event.error;
      if (/401|unauthor|session|transport|connect/i.test(event.error)) await this.disconnect();
      throw new Error(event.error);
    }
  }

  private async waitForRetrySlot(delayMs: number): Promise<void> {
    const previous = this.retryQueue;
    let release: () => void = () => {};
    this.retryQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const waitMs = Math.max(delayMs, this.nextRetryAt - Date.now());
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.nextRetryAt = Date.now() + 6_500;
    } finally {
      release();
    }
  }

  getEvents(): ConsoleEvent[] {
    return structuredClone(this.events);
  }

  status(): {
    connected: boolean;
    toolCount: number;
    lastSuccess: string | null;
    lastError: string | null;
  } {
    return {
      connected: Boolean(this.client),
      toolCount: this.toolsCache.length,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
    };
  }
}

export function normalizeMcpResultForTest(result: unknown): unknown {
  return normalizeResult(result);
}
