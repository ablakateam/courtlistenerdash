import type { JsonObject, LegalAiStatus } from "../shared/types.js";
import type { LegalAiConfig } from "./ai-config-store.js";
import { LegalAiConfigStore } from "./ai-config-store.js";
import { redactSecrets } from "./security.js";

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function jsonText(value: unknown): string {
  const text = String(value ?? "").trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? text).trim();
}

function safeProviderError(status: number, body: string): Error {
  const cleaned = String(redactSecrets(body)).replace(/\s+/g, " ").slice(0, 500);
  return new Error(`AI provider request failed (${status})${cleaned ? `: ${cleaned}` : ""}`);
}

export class LegalAiClient {
  private available = false;
  private lastCheckedAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly store: LegalAiConfigStore,
    private readonly timeoutMs = 300_000,
  ) {}

  private async request(config: LegalAiConfig, system: string, user: string, maxTokens: number): Promise<string> {
    let url: string;
    let headers: Record<string, string> = { "content-type": "application/json" };
    let body: JsonObject;
    if (config.provider === "ollama") {
      url = joinUrl(config.baseUrl, "/api/chat");
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
      body = {
        model: config.model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        options: { temperature: 0, num_predict: maxTokens },
      };
    } else if (config.provider === "anthropic") {
      url = joinUrl(config.baseUrl, "/messages");
      headers = {
        ...headers,
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      };
      body = {
        model: config.model,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      };
    } else {
      url = joinUrl(config.baseUrl, "/chat/completions");
      headers.authorization = `Bearer ${config.apiKey}`;
      body = {
        model: config.model,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "developer", content: system },
          { role: "user", content: user },
        ],
      };
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const responseText = await response.text();
    if (!response.ok) throw safeProviderError(response.status, responseText);
    let payload: JsonObject;
    try {
      payload = JSON.parse(responseText) as JsonObject;
    } catch {
      throw new Error("AI provider returned a non-JSON protocol response");
    }
    if (config.provider === "ollama") return jsonText((payload.message as JsonObject | undefined)?.content);
    if (config.provider === "anthropic") {
      const content = Array.isArray(payload.content) ? payload.content : [];
      return jsonText(content.map((item) => (item as JsonObject).text).filter(Boolean).join("\n"));
    }
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    return jsonText(((choices[0] as JsonObject | undefined)?.message as JsonObject | undefined)?.content);
  }

  async completeJson<T = JsonObject>(system: string, user: string, maxTokens = 4_000): Promise<T> {
    const config = await this.store.get();
    if (!config) throw new Error("Configure a legal AI provider in Settings before generating analysis");
    try {
      const content = await this.request(config, system, user, maxTokens);
      if (!content) throw new Error("AI provider returned an empty response");
      const parsed = JSON.parse(content) as T;
      this.available = true;
      this.lastCheckedAt = new Date().toISOString();
      this.lastError = null;
      return parsed;
    } catch (error) {
      this.available = false;
      this.lastCheckedAt = new Date().toISOString();
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async test(config?: LegalAiConfig): Promise<void> {
    const active = config ?? await this.store.get();
    if (!active) throw new Error("Legal AI is not configured");
    try {
      const response = await this.request(
        active,
        "Return only valid JSON. Do not include markdown.",
        'Connectivity check. Return exactly {"status":"ready"}.',
        256,
      );
      const value = JSON.parse(response) as JsonObject;
      if (value.status !== "ready") throw new Error("AI provider returned an unexpected validation response");
      this.available = true;
      this.lastCheckedAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.available = false;
      this.lastCheckedAt = new Date().toISOString();
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async status(): Promise<LegalAiStatus> {
    const config = await this.store.get();
    return {
      configured: Boolean(config),
      available: Boolean(config) && this.available,
      provider: config?.provider ?? null,
      model: config?.model ?? null,
      baseUrl: config?.baseUrl ?? null,
      lastCheckedAt: this.lastCheckedAt,
      lastError: this.lastError,
    };
  }

  async configuration(): Promise<LegalAiConfig | null> {
    return this.store.get();
  }
}
