import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import express, { type Express, type Request, type Response } from "express";
import helmet from "helmet";
import type {
  ApiUsageLimit,
  ApiUsageSummary,
  CaseAnalysisState,
  ConfirmationChallenge,
  JsonObject,
  SearchRequest,
  ToolCoverageRow,
} from "../shared/types.js";
import type { AppConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import {
  CourtListenerMcpClient,
  EXPECTED_MCP_TOOLS,
  STATE_CHANGING_TOOLS,
} from "./mcp-client.js";
import { SecurityManager, hashPassword, passwordStrengthProblem, redactSecrets } from "./security.js";
import { PasswordStore } from "./password-store.js";
import { TokenStore } from "./token-store.js";
import { LegalAiConfigStore, normalizeLegalAiConfig } from "./ai-config-store.js";
import { LegalAiClient } from "./legal-ai.js";
import { analyzeOpinion, answerOpinionQuestion } from "./legal-analysis.js";

interface AppDependencies {
  config: AppConfig;
  security: SecurityManager;
  tokenStore: TokenStore;
  mcp: CourtListenerMcpClient;
  db: AppDatabase;
  passwordStore: PasswordStore;
  aiConfigStore: LegalAiConfigStore;
  legalAi: LegalAiClient;
}

interface StoredChallenge extends ConfirmationChallenge {
  sessionId: string;
  argumentsHash: string;
}

const UI_LOCATIONS: Record<string, string> = {
  search: "Research, Semantic Search, Cases, Dockets, Oral Arguments, Judges",
  get_endpoint_schema: "API Explorer",
  call_endpoint: "All research workspaces and API Explorer",
  get_endpoint_item: "Case, docket, document, judge, and disclosure workspaces",
  get_choices: "API Explorer filter builder",
  get_counts: "Search pagination",
  get_more_results: "Search pagination",
  read_document: "Opinion and RECAP document reader",
  search_document: "Opinion and RECAP document reader",
  extract_citations: "Citation Verification",
  analyze_citations: "Citation Verification",
  resume_citation_analysis: "Citation Verification",
  create_search_alert: "Alerts",
  delete_search_alert: "Alerts",
  subscribe_to_docket_alert: "Docket workspace and Alerts",
  unsubscribe_from_docket_alert: "Docket workspace and Alerts",
  pray_for_document: "RECAP document workspace",
  withdraw_prayer: "RECAP document workspace",
  get_api_usage: "Dashboard and MCP Console",
};

function objectBody(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A JSON object is required");
  }
  return value as JsonObject;
}

function text(value: unknown, name: string, max = 20_000): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim().slice(0, max);
}

function integer(value: unknown, name: string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function endpointName(value: unknown): string {
  const endpoint = text(value, "endpoint", 100);
  if (!/^[a-z0-9][a-z0-9/-]*$/.test(endpoint)) throw new Error("Invalid endpoint name");
  return endpoint;
}

function resultData<T = unknown>(value: { data: unknown }): T {
  return value.data as T;
}

function extractId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return Number(value);
    const match = value.match(/\/(\d+)\/?$/);
    if (match) return Number(match[1]);
  }
  if (value && typeof value === "object" && "id" in value) {
    return extractId((value as { id: unknown }).id);
  }
  return null;
}

function argsHash(tool: string, args: JsonObject): string {
  return createHash("sha256").update(`${tool}\n${JSON.stringify(args)}`).digest("base64url");
}

function actionSummary(tool: string, args: JsonObject): string {
  switch (tool) {
    case "create_search_alert":
      return `Create CourtListener search alert “${String(args.name ?? "Unnamed")}” at ${String(args.rate ?? "the selected")} frequency for ${JSON.stringify(args.query ?? {})}`;
    case "delete_search_alert":
      return `Permanently delete CourtListener search alert ${String(args.id ?? "")}`;
    case "subscribe_to_docket_alert":
      return `Subscribe the CourtListener account to updates for docket ${String(args.docket ?? "")}`;
    case "unsubscribe_from_docket_alert":
      return `Unsubscribe the CourtListener account from updates for docket ${String(args.docket ?? "")}`;
    case "pray_for_document":
      return `Request RECAP document ${String(args.recap_document_id ?? "")} through Pray and Pay (no charge; uses the account’s daily prayer allowance)`;
    case "withdraw_prayer":
      return `Withdraw the pending Pray and Pay request for RECAP document ${String(args.recap_document_id ?? "")}`;
    default:
      return `Run account-changing CourtListener tool ${tool}`;
  }
}

function searchArguments(body: SearchRequest): JsonObject {
  const validTypes = new Set(["o", "r", "rd", "d", "p", "oa"]);
  if (!validTypes.has(body.type)) throw new Error("Unsupported CourtListener search type");
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const citation = typeof body.citation === "string" ? body.citation.trim() : "";
  if (!query && !(body.type === "o" && citation)) throw new Error("Search query is required");
  const args: JsonObject = {
    type: body.type,
    num_results: Math.max(1, Math.min(Number(body.numResults) || 20, 100)),
  };
  if (query) args.q = text(query, "Search query", 2_000);
  if (body.semantic) {
    if (body.type !== "o") throw new Error("CourtListener semantic search is available for opinions only");
    args.semantic = true;
  }
  if (body.court?.trim()) args.court = body.court.trim().slice(0, 200);
  if (body.filedAfter?.trim()) {
    args[body.type === "oa" ? "argued_after" : "filed_after"] = body.filedAfter.trim().slice(0, 50);
  }
  if (body.filedBefore?.trim()) {
    args[body.type === "oa" ? "argued_before" : "filed_before"] = body.filedBefore.trim().slice(0, 50);
  }
  if (body.judge?.trim()) args.judge = body.judge.trim().slice(0, 200);
  if (citation) args.citation = citation.slice(0, 200);
  return args;
}

async function settledObject(tasks: Record<string, Promise<unknown>>): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(tasks).map(async ([key, promise]) => {
      try {
        return [key, await promise] as const;
      } catch (error) {
        const details = courtListenerErrorDetails(error);
        return [key, { code: details.code, error: details.message }] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

function courtListenerErrorDetails(error: unknown): { status: number; code: string; message: string } {
  const raw = String(redactSecrets(error instanceof Error ? error.message : String(error)));
  const wait = raw.match(/available in\s+(\d+)\s+seconds?/i)?.[1];
  if (/429|rate limit|throttled/i.test(raw)) {
    const window = /\b\d+\s*\/\s*day\b|daily limit/i.test(raw)
      ? "daily"
      : /\b\d+\s*\/\s*hour\b|hourly limit/i.test(raw)
        ? "hourly"
        : /\b\d+\s*\/\s*min\b|minute limit/i.test(raw)
          ? "minute"
          : "request";
    const guidance = window === "hourly" || window === "daily"
      ? "Check the allowance meter in the header before trying again."
      : wait
        ? `Try again in about ${wait} seconds.`
        : "Please wait before trying again.";
    return { status: 429, code: "courtlistener_rate_limited", message: `CourtListener's ${window} limit has been reached. ${guidance}` };
  }
  if (/401|403|unauthor|forbidden|credential|token/i.test(raw)) {
    return { status: 503, code: "courtlistener_authentication", message: "CourtListener could not authenticate this connection. Review the CourtListener token in Settings." };
  }
  if (/timed out|timeout/i.test(raw)) {
    return { status: 504, code: "courtlistener_timeout", message: "CourtListener took too long to respond. No result was recorded; please try again." };
  }
  if (/validation error|invalid value|malformed|required|unsupported/i.test(raw)) {
    return { status: 400, code: "invalid_courtlistener_request", message: "CourtListener rejected one of the search or record filters. Review the selected filters and try again." };
  }
  if (/404|not found|does not exist/i.test(raw)) {
    return { status: 404, code: "courtlistener_not_found", message: "CourtListener could not locate that record." };
  }
  if (/transport|connect|network|unavailable|502|503/i.test(raw)) {
    return { status: 503, code: "courtlistener_unavailable", message: "CourtListener is temporarily unavailable. Please try again shortly." };
  }
  return { status: 502, code: "courtlistener_request_failed", message: "CourtListener could not complete this request. No data was changed." };
}

function sendCourtListenerError(res: Response, error: unknown): void {
  const details = courtListenerErrorDetails(error);
  res.status(details.status).json({ code: details.code, error: details.message });
}

function usageSummary(value: unknown): ApiUsageSummary {
  const root = value && typeof value === "object" ? (value as JsonObject) : {};
  const current = root.current_usage && typeof root.current_usage === "object" ? (root.current_usage as JsonObject) : {};
  const user = current.user && typeof current.user === "object" ? (current.user as JsonObject) : {};
  const rawLimits = Array.isArray(user.limits) ? user.limits : [];
  const limits = rawLimits.flatMap((item): ApiUsageLimit[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as JsonObject;
    const limit = Number(row.limit);
    const used = Number(row.used);
    const remaining = Number(row.remaining);
    const windowSeconds = Number(row.window_seconds);
    if (![limit, used, remaining, windowSeconds].every(Number.isFinite)) return [];
    return [{
      rate: String(row.rate ?? ""),
      used,
      limit,
      remaining,
      windowSeconds,
      resetAt: typeof row.reset_at === "string" ? row.reset_at : null,
      blocked: Boolean(row.blocked),
    }];
  });
  const byWindow = (seconds: number) => limits.find((item) => item.windowSeconds === seconds) ?? null;
  const historicalRoot = root.historical_usage && typeof root.historical_usage === "object"
    ? (root.historical_usage as JsonObject)
    : {};
  const historical = Object.entries(historicalRoot)
    .filter(([date, count]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Number(count)))
    .map(([date, count]) => ({ date, count: Number(count) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    minute: byWindow(60),
    hour: byWindow(3_600),
    day: byWindow(86_400),
    historical,
    fourteenDayTotal: Number(historicalRoot.total) || historical.reduce((sum, item) => sum + item.count, 0),
    checkedAt: new Date().toISOString(),
  };
}

export function createApp(deps: AppDependencies): Express {
  const { config, security, tokenStore, mcp, db, passwordStore, aiConfigStore, legalAi } = deps;
  const app = express();
  const challenges = new Map<string, StoredChallenge>();
  const requestBuckets = new Map<string, { count: number; resetAt: number }>();
  const choiceCache = new Map<string, { result: unknown; expiresAt: number }>();
  let usageCache: { raw: unknown; summary: ApiUsageSummary; expiresAt: number } | null = null;
  let usagePending: Promise<{ raw: unknown; summary: ApiUsageSummary }> | null = null;
  const analysisJobs = new Map<number, Promise<void>>();
  const opinionTextCache = new Map<number, { text: string; expiresAt: number }>();

  async function loadOpinionText(opinionId: number): Promise<string> {
    const cached = opinionTextCache.get(opinionId);
    if (cached && cached.expiresAt > Date.now()) return cached.text;
    const payload = resultData<JsonObject>(await mcp.call("read_document", { opinion_id: opinionId }));
    const documentText = typeof payload.text === "string" ? payload.text : "";
    if (!documentText.trim()) throw new Error(String(payload.error ?? "CourtListener did not return full text for this opinion"));
    opinionTextCache.set(opinionId, { text: documentText, expiresAt: Date.now() + 60 * 60_000 });
    return documentText;
  }

  async function loadUsage(): Promise<{ raw: unknown; summary: ApiUsageSummary }> {
    if (usageCache && usageCache.expiresAt > Date.now()) return usageCache;
    if (usagePending) return usagePending;
    usagePending = (async () => {
      const raw = resultData(await mcp.call("get_api_usage", {}));
      const summary = usageSummary(raw);
      usageCache = { raw, summary, expiresAt: Date.now() + 45_000 };
      return { raw, summary };
    })();
    try {
      return await usagePending;
    } finally {
      usagePending = null;
    }
  }

  app.disable("x-powered-by");
  // Trust exactly one proxy hop only when an operator explicitly enables it.
  // The portable Compose deployment keeps the app on an internal network and
  // places Caddy at that hop; direct installations retain loopback-only trust.
  app.set("trust proxy", config.trustProxy ? 1 : "loopback");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https://www.courtlistener.com"],
          mediaSrc: ["'self'", "https://storage.courtlistener.com", "https://www.courtlistener.com"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: config.tlsEnabled ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "2mb", strict: true }));

  app.use("/api", (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = requestBuckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
    bucket.count += 1;
    requestBuckets.set(key, bucket);
    res.setHeader("X-RateLimit-Limit", String(config.maxRequestsPerMinute));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, config.maxRequestsPerMinute - bucket.count)));
    if (bucket.count > config.maxRequestsPerMinute) {
      res.status(429).json({ error: "Too many requests; wait a minute and try again" });
      return;
    }
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "healthy", service: "courtlistenerdash", version: config.version });
  });

  app.get("/api/auth/status", (req, res) => {
    const session = security.session(req);
    res.json({
      authenticated: Boolean(session),
      csrfToken: session?.csrf ?? null,
      tls: req.secure || config.tlsEnabled,
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const password = text(objectBody(req.body).password, "Password", 1_000);
      const session = await security.login(req, res, password);
      db.recordActivity("security", "login", "Administrator signed in", "success", null);
      res.json({ authenticated: true, csrfToken: session.csrf });
    } catch (error) {
      res.status(401).json({ error: error instanceof Error ? error.message : "Login failed" });
    }
  });

  app.use("/api", security.requireAuth);

  app.post("/api/auth/logout", security.requireCsrf, (req, res) => {
    security.logout(req, res);
    res.json({ ok: true });
  });

  app.put("/api/auth/password", security.requireCsrf, async (req, res) => {
    try {
      const body = objectBody(req.body);
      const currentPassword = text(body.currentPassword, "Current password", 1_000);
      const newPassword = text(body.newPassword, "New password", 1_000);
      const confirmation = text(body.confirmation, "Password confirmation", 1_000);
      if (!(await security.verifyCurrentPassword(currentPassword))) {
        res.status(403).json({ error: "Current password is incorrect" });
        return;
      }
      if (newPassword !== confirmation) throw new Error("New password and confirmation do not match");
      if (newPassword === currentPassword) throw new Error("New password must be different from the current password");
      const problem = passwordStrengthProblem(newPassword);
      if (problem) throw new Error(problem);
      const nextHash = await hashPassword(newPassword);
      await passwordStore.set(nextHash);
      const session = res.locals.session as { id: string };
      security.replacePasswordHash(nextHash, session.id);
      db.recordActivity("security", "password-change", "Administrator password changed", "success", null);
      res.json({ ok: true });
    } catch (error) {
      db.recordActivity("security", "password-change", "Administrator password change rejected", "error", null);
      res.status(400).json({ error: error instanceof Error ? error.message : "Password change failed" });
    }
  });

  app.get("/api/status", async (_req, res) => {
    const configured = await tokenStore.isConfigured();
    const legalAiStatus = await legalAi.status();
    let sourceRevision: string | null = null;
    let upstreamHealthy = false;
    try {
      const response = await fetch(config.mcpHealthEndpoint, { signal: AbortSignal.timeout(8_000) });
      const health = (await response.json()) as Record<string, unknown>;
      upstreamHealthy = response.ok;
      sourceRevision = String(health.git_sha ?? health.gitSha ?? health.revision ?? "") || null;
    } catch {
      upstreamHealthy = false;
    }
    if (configured && !mcp.status().connected) {
      await mcp.listTools().catch(() => undefined);
    }
    const state = mcp.status();
    res.json({
      web: "healthy",
      mcp: state.connected ? "connected" : configured && state.lastError ? "error" : "disconnected",
      api: state.connected ? "available" : upstreamHealthy ? "unknown" : "unavailable",
      authenticated: true,
      credentialConfigured: configured,
      lastSuccessfulRequest: state.lastSuccess,
      lastError: state.lastError,
      endpoint: config.mcpEndpoint,
      toolCount: state.toolCount,
      sourceRevision,
      lanUrls: config.lanUrls,
      version: config.version,
      tls: config.tlsEnabled,
      legalAi: legalAiStatus,
    });
  });

  app.put("/api/connections/courtlistener", security.requireCsrf, async (req, res) => {
    const forwardedHttps = req.header("x-forwarded-proto") === "https";
    if (!req.secure && !forwardedHttps && !config.allowInsecureCredentialSetup) {
      res.status(426).json({ error: "CourtListener credential setup requires HTTPS" });
      return;
    }
    try {
      const token = text(objectBody(req.body).token, "CourtListener API token", 5_000);
      const validation = await mcp.testCredential(token);
      await tokenStore.set(token);
      await mcp.disconnect();
      await mcp.listTools(true);
      db.recordActivity(
        "connection",
        "credential-update",
        `CourtListener credential validated; ${validation.toolCount} MCP tools available`,
        "success",
        null,
      );
      res.json({ ok: true, configured: true, toolCount: validation.toolCount });
    } catch (error) {
      db.recordActivity("connection", "credential-update", "CourtListener credential validation failed", "error", null);
      res.status(400).json({ error: redactSecrets(error instanceof Error ? error.message : String(error)) });
    }
  });

  app.delete("/api/connections/courtlistener", security.requireCsrf, async (req, res) => {
    try {
      if (objectBody(req.body).confirm !== "REMOVE") throw new Error("Type REMOVE to clear the credential");
      await mcp.disconnect();
      await tokenStore.clear();
      db.recordActivity("connection", "credential-remove", "CourtListener credential removed", "success", null);
      res.json({ ok: true, configured: false });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/ai/status", async (_req, res) => {
    res.json(await legalAi.status());
  });

  app.put("/api/connections/legal-ai", security.requireCsrf, async (req, res) => {
    try {
      const body = objectBody(req.body);
      const existing = await aiConfigStore.get();
      const requestedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      const candidate = normalizeLegalAiConfig({
        provider: body.provider,
        baseUrl: body.baseUrl,
        model: body.model,
        apiKey: requestedKey || (existing && existing.provider === body.provider ? existing.apiKey : ""),
      });
      await legalAi.test(candidate);
      await aiConfigStore.set(candidate);
      db.recordActivity("connection", "legal-ai-update", `${candidate.provider} model ${candidate.model} validated`, "success", null);
      res.json(await legalAi.status());
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : String(error));
      db.recordActivity("connection", "legal-ai-update", "Legal AI provider validation failed", "error", null);
      res.status(400).json({ error: message });
    }
  });

  app.delete("/api/connections/legal-ai", security.requireCsrf, async (req, res) => {
    try {
      if (objectBody(req.body).confirm !== "REMOVE") throw new Error("Type REMOVE to clear the AI connection");
      if (analysisJobs.size) throw new Error("Wait for the active case analysis to finish before removing the AI connection");
      await aiConfigStore.clear();
      db.recordActivity("connection", "legal-ai-remove", "Legal AI provider configuration removed", "success", null);
      res.json(await legalAi.status());
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/dashboard", async (_req, res) => {
    const [configured, usage] = await Promise.all([
      tokenStore.isConfigured(),
      tokenStore.isConfigured().then((yes) =>
        yes ? loadUsage().catch(() => null) : null,
      ),
    ]);
    res.json({
      configured,
      usage: usage?.raw ?? null,
      usageSummary: usage?.summary ?? null,
      activity: db.listActivity(12),
      saved: db.listSaved(8),
      mcp: mcp.status(),
    });
  });

  app.get("/api/usage", async (_req, res) => {
    try {
      if (!(await tokenStore.isConfigured())) {
        res.status(503).json({ error: "Connect CourtListener to view API usage" });
        return;
      }
      res.json((await loadUsage()).summary);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/mcp/tools", async (_req, res) => {
    try {
      res.json({ tools: await mcp.listTools() });
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : String(error), tools: [] });
    }
  });

  app.get("/api/mcp/events", (_req, res) => {
    res.json({ events: mcp.getEvents() });
  });

  app.get("/api/mcp/coverage", async (_req, res) => {
    let available = new Set<string>();
    try {
      available = new Set((await mcp.listTools()).map((tool) => tool.name));
    } catch {
      // A disconnected coverage matrix still communicates expected coverage.
    }
    const rows: ToolCoverageRow[] = EXPECTED_MCP_TOOLS.map((name) => ({
      name,
      available: available.has(name),
      implemented: true,
      uiLocation: UI_LOCATIONS[name] || "MCP Console",
      tested: available.has(name) ? (name === "get_api_usage" ? "live" : "schema") : "pending",
      result: available.has(name)
        ? name === "get_api_usage"
          ? "Connected and read-only call verified"
          : "Live schema discovered; available through module and MCP Console"
        : "Awaiting a valid CourtListener credential",
      stateChanging: STATE_CHANGING_TOOLS.has(name),
    }));
    for (const name of available) {
      if (!rows.some((row) => row.name === name)) {
        rows.push({
          name,
          available: true,
          implemented: true,
          uiLocation: "MCP Console (new upstream capability)",
          tested: "schema",
          result: "Dynamically discovered and immediately callable",
          stateChanging: false,
        });
      }
    }
    res.json({ rows });
  });

  app.post("/api/actions/prepare", security.requireCsrf, (req, res) => {
    try {
      const body = objectBody(req.body);
      const tool = text(body.tool, "Tool", 200);
      const args = objectBody(body.arguments ?? {});
      if (!STATE_CHANGING_TOOLS.has(tool)) throw new Error("This tool does not require an action confirmation");
      const session = res.locals.session as { id: string };
      const challenge: StoredChallenge = {
        challengeId: randomUUID(),
        tool,
        summary: actionSummary(tool, args),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        sessionId: session.id,
        argumentsHash: argsHash(tool, args),
      };
      challenges.set(challenge.challengeId, challenge);
      res.json({
        challengeId: challenge.challengeId,
        tool: challenge.tool,
        summary: challenge.summary,
        expiresAt: challenge.expiresAt,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/mcp/call", security.requireCsrf, async (req, res) => {
    const started = performance.now();
    try {
      const body = objectBody(req.body);
      const tool = text(body.tool, "Tool", 200);
      const args = objectBody(body.arguments ?? {});
      if (STATE_CHANGING_TOOLS.has(tool)) {
        const challengeId = text(body.challengeId, "Confirmation challenge", 100);
        const challenge = challenges.get(challengeId);
        const session = res.locals.session as { id: string };
        challenges.delete(challengeId);
        if (
          !challenge ||
          challenge.sessionId !== session.id ||
          challenge.tool !== tool ||
          challenge.argumentsHash !== argsHash(tool, args) ||
          Date.parse(challenge.expiresAt) <= Date.now()
        ) {
          throw new Error("The action confirmation is missing, expired, or does not match this request");
        }
      }
      const result = await mcp.call(tool, args);
      const summary = STATE_CHANGING_TOOLS.has(tool) ? actionSummary(tool, args) : `${tool} completed`;
      db.recordActivity("mcp", tool, summary, "success", result.durationMs);
      if (STATE_CHANGING_TOOLS.has(tool)) db.recordAction(tool, summary, args, "success", JSON.stringify(result.data));
      res.json(result);
    } catch (error) {
      const duration = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : String(error);
      db.recordActivity("mcp", "tool-call", message, "error", duration);
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/search", security.requireCsrf, async (req, res) => {
    try {
      const args = searchArguments(objectBody(req.body) as unknown as SearchRequest);
      const result = await mcp.call("search", args);
      db.recordActivity("research", args.semantic ? "semantic-search" : "keyword-search", String(args.q ?? args.citation), "success", result.durationMs);
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.post("/api/search/unified", security.requireCsrf, async (req, res) => {
    try {
      const body = objectBody(req.body);
      const query = text(body.query, "Search query", 2_000);
      const requested = Array.isArray(body.types) ? body.types : ["o", "d", "r", "rd", "oa", "p"];
      const types = requested.filter((value): value is SearchRequest["type"] =>
        ["o", "r", "rd", "d", "p", "oa"].includes(String(value)),
      );
      const results = await settledObject(
        Object.fromEntries(
          types.map((type) => [
            type,
            mcp.call("search", searchArguments({ query, type, numResults: Number(body.numResults) || 10 })).then(resultData),
          ]),
        ),
      );
      db.recordActivity("research", "unified-search", query, "success", null);
      res.json({ query, results });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.post("/api/search/more", security.requireCsrf, async (req, res) => {
    try {
      const body = objectBody(req.body);
      const queryId = text(body.queryId, "Search query ID", 200);
      if (!/^[A-Za-z0-9._:-]+$/.test(queryId)) throw new Error("Search query ID is malformed");
      const result = await mcp.call("get_more_results", {
        query_id: queryId,
        num_results: Math.max(1, Math.min(Number(body.numResults) || 20, 100)),
      });
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/items/:endpoint/:id", async (req, res) => {
    try {
      const result = await mcp.call("get_endpoint_item", {
        endpoint_id: endpointName(req.params.endpoint),
        item_id: /^\d+$/.test(req.params.id) ? Number(req.params.id) : req.params.id,
      });
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/endpoint-schema/:endpoint", async (req, res) => {
    try {
      const result = await mcp.call("get_endpoint_schema", { endpoint_id: endpointName(req.params.endpoint) });
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.post("/api/endpoint/:endpoint", security.requireCsrf, async (req, res) => {
    try {
      const body = objectBody(req.body);
      const result = await mcp.call("call_endpoint", {
        endpoint_id: endpointName(req.params.endpoint),
        query: objectBody(body.query ?? {}),
        num_results: Math.max(1, Math.min(Number(body.numResults) || 20, 100)),
      });
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/choices/:endpoint/:field", async (req, res) => {
    try {
      const endpoint = endpointName(req.params.endpoint);
      const field = text(req.params.field, "field", 100);
      const key = `${endpoint}:${field}`;
      const cached = choiceCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        res.json(cached.result);
        return;
      }
      const result = await mcp.call("get_choices", { endpoint_id: endpoint, field_name: field });
      choiceCache.set(key, { result, expiresAt: Date.now() + 6 * 60 * 60_000 });
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/cases/:clusterId/workspace", async (req, res) => {
    try {
      const clusterId = integer(req.params.clusterId, "Cluster ID");
      const cluster = resultData<JsonObject>(
        await mcp.call("get_endpoint_item", { endpoint_id: "clusters", item_id: clusterId }),
      );
      const docketId = extractId(cluster.docket);
      const opinionResponse = resultData<{ results?: JsonObject[] }>(
        await mcp.call("call_endpoint", {
          endpoint_id: "opinions",
          query: { cluster: clusterId },
          num_results: 20,
        }),
      );
      const opinions = opinionResponse.results ?? [];
      const mainOpinionId = extractId(opinions[0]?.id);
      let docket: unknown = null;
      if (docketId) {
        docket = await mcp.call("get_endpoint_item", { endpoint_id: "dockets", item_id: docketId }).then(resultData).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
      }
      db.recordActivity("case", "view-case", String(cluster.case_name_full ?? cluster.case_name ?? `Case ${clusterId}`), "success", null);
      res.json({ clusterId, cluster, docketId, mainOpinionId, opinions: opinionResponse, docket });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/cases/:clusterId/section/:section", async (req, res) => {
    try {
      integer(req.params.clusterId, "Cluster ID");
      const section = text(req.params.section, "Case section", 30);
      const docketId = req.query.docketId ? integer(req.query.docketId, "Docket ID") : null;
      const opinionId = req.query.opinionId ? integer(req.query.opinionId, "Opinion ID") : null;
      const mode = typeof req.query.mode === "string" ? req.query.mode : "";
      let tasks: Record<string, Promise<unknown>>;
      if (section === "participants" && docketId) {
        if (!["party", "attorney"].includes(mode)) throw new Error("Unsupported participant type");
        const endpoint = mode === "party" ? "parties" : "attorneys";
        tasks = { [endpoint]: mcp.call("call_endpoint", { endpoint_id: endpoint, query: { docket: docketId }, num_results: 100 }).then(resultData) };
      } else if (section === "docket" && docketId) {
        if (!["timeline", "documents"].includes(mode)) throw new Error("Unsupported docket view");
        tasks = mode === "timeline"
          ? { entries: mcp.call("call_endpoint", { endpoint_id: "docket-entries", query: { docket: docketId, order_by: "date_filed" }, num_results: 100 }).then(resultData) }
          : { documents: mcp.call("call_endpoint", { endpoint_id: "recap-documents", query: { docket_entry: { docket: docketId } }, num_results: 100 }).then(resultData) };
      } else if (section === "citations" && opinionId) {
        if (!["graph", "citing", "cited"].includes(mode)) throw new Error("Unsupported citation view");
        tasks = {};
        if (mode !== "citing") tasks.cites = mcp.call("call_endpoint", { endpoint_id: "opinions-cited", query: { citing_opinion: opinionId }, num_results: 100 }).then(resultData);
        if (mode !== "cited") tasks.citedBy = mcp.call("call_endpoint", { endpoint_id: "opinions-cited", query: { cited_opinion: opinionId }, num_results: 100 }).then(resultData);
      } else if (section === "oral" && docketId) {
        tasks = { audio: mcp.call("call_endpoint", { endpoint_id: "audio", query: { docket: docketId }, num_results: 25 }).then(resultData) };
      } else {
        throw new Error("Unsupported case section or missing linked record identifier");
      }
      res.json(await settledObject(tasks));
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/cases/:clusterId/analysis", async (req, res) => {
    try {
      integer(req.params.clusterId, "Cluster ID");
      const opinionId = integer(req.query.opinionId, "Opinion ID");
      const stored = db.getAnalysisState(opinionId);
      const response: CaseAnalysisState = stored
        ? { ...stored, ai: await legalAi.status() }
        : {
            status: "not_started",
            progress: 0,
            stage: "Ready to analyze",
            error: null,
            updatedAt: null,
            analysis: null,
            ai: await legalAi.status(),
          };
      res.json(response);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/cases/:clusterId/analysis", security.requireCsrf, async (req, res) => {
    try {
      const clusterId = integer(req.params.clusterId, "Cluster ID");
      const body = objectBody(req.body);
      const opinionId = integer(body.opinionId, "Opinion ID");
      const regenerate = body.regenerate === true;
      const aiStatus = await legalAi.status();
      if (!aiStatus.configured) {
        res.status(409).json({ error: "Configure a legal AI provider in Settings before generating analysis" });
        return;
      }
      const existing = db.getAnalysisState(opinionId);
      if (existing?.status === "complete" && !regenerate) {
        res.json({ ...existing, ai: aiStatus });
        return;
      }
      if (analysisJobs.has(opinionId)) {
        res.status(202).json({ ...(db.getAnalysisState(opinionId) ?? existing), ai: aiStatus });
        return;
      }
      if (analysisJobs.size) {
        res.status(429).json({ error: "Another long-opinion analysis is running. Wait for it to finish, then try again." });
        return;
      }
      const configuration = await legalAi.configuration();
      db.setAnalysisState({
        clusterId,
        opinionId,
        status: "queued",
        progress: 2,
        stage: "Queued for complete-opinion analysis",
        provider: configuration?.provider ?? null,
        model: configuration?.model ?? null,
      });
      const job = (async () => {
        const started = performance.now();
        try {
          db.setAnalysisState({ clusterId, opinionId, status: "running", progress: 4, stage: "Retrieving the complete opinion from CourtListener" });
          const documentText = await loadOpinionText(opinionId);
          const analysis = await analyzeOpinion({
            clusterId,
            opinionId,
            text: documentText,
            ai: legalAi,
            onProgress: (progress, stage) => db.setAnalysisState({ clusterId, opinionId, status: "running", progress, stage }),
          });
          db.setAnalysisState({ clusterId, opinionId, status: "complete", progress: 100, stage: "Analysis complete", analysis });
          db.recordActivity("analysis", "case-analysis", `Grounded complete-opinion analysis generated for opinion ${opinionId}`, "success", Math.round(performance.now() - started));
        } catch (error) {
          const message = String(redactSecrets(error instanceof Error ? error.message : String(error))).slice(0, 2_000);
          db.setAnalysisState({ clusterId, opinionId, status: "error", progress: 0, stage: "Analysis failed", error: message });
          db.recordActivity("analysis", "case-analysis", message, "error", Math.round(performance.now() - started));
        } finally {
          analysisJobs.delete(opinionId);
        }
      })();
      analysisJobs.set(opinionId, job);
      res.status(202).json({ ...db.getAnalysisState(opinionId), ai: aiStatus });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/cases/:clusterId/ask", security.requireCsrf, async (req, res) => {
    const started = performance.now();
    try {
      integer(req.params.clusterId, "Cluster ID");
      const body = objectBody(req.body);
      const opinionId = integer(body.opinionId, "Opinion ID");
      const question = text(body.question, "Question", 2_000);
      const documentText = await loadOpinionText(opinionId);
      const analysis = db.getAnalysisState(opinionId)?.analysis ?? null;
      const answer = await answerOpinionQuestion({ question, text: documentText, analysis, ai: legalAi });
      db.recordActivity("analysis", "case-question", question, "success", Math.round(performance.now() - started));
      res.json(answer);
    } catch (error) {
      const message = String(redactSecrets(error instanceof Error ? error.message : String(error)));
      db.recordActivity("analysis", "case-question", message, "error", Math.round(performance.now() - started));
      res.status(400).json({ error: message });
    }
  });

  app.get("/api/dockets/:docketId/workspace", async (req, res) => {
    try {
      const docketId = integer(req.params.docketId, "Docket ID");
      const docketRecord = resultData<JsonObject>(
        await mcp.call("get_endpoint_item", { endpoint_id: "dockets", item_id: docketId }),
      );
      db.recordActivity("docket", "view-docket", String(docketRecord.case_name ?? docketRecord.docket_number ?? `Docket ${docketId}`), "success", null);
      res.json({ docketId, docket: docketRecord });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/dockets/:docketId/section/:section", async (req, res) => {
    try {
      const docketId = integer(req.params.docketId, "Docket ID");
      const section = text(req.params.section, "Docket section", 30);
      const definitions: Record<string, { endpoint: string; query: JsonObject; limit: number }> = {
        timeline: { endpoint: "docket-entries", query: { docket: docketId, order_by: "date_filed" }, limit: 100 },
        documents: { endpoint: "recap-documents", query: { docket_entry: { docket: docketId } }, limit: 100 },
        parties: { endpoint: "parties", query: { docket: docketId }, limit: 100 },
        attorneys: { endpoint: "attorneys", query: { docket: docketId }, limit: 100 },
        oral: { endpoint: "audio", query: { docket: docketId }, limit: 25 },
      };
      const definition = definitions[section];
      if (!definition) throw new Error("Unsupported docket section");
      const data = resultData(
        await mcp.call("call_endpoint", {
          endpoint_id: definition.endpoint,
          query: definition.query,
          num_results: definition.limit,
        }),
      );
      res.json({ section, data });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/oral-arguments/:audioId/workspace", async (req, res) => {
    try {
      const audioId = integer(req.params.audioId, "Oral argument ID");
      const audio = resultData<JsonObject>(
        await mcp.call("get_endpoint_item", { endpoint_id: "audio", item_id: audioId }),
      );
      res.json({ audioId, audio });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/opinions/:opinionId/citations", async (req, res) => {
    try {
      const opinionId = integer(req.params.opinionId, "Opinion ID");
      const data = await settledObject({
        opinion: mcp.call("get_endpoint_item", { endpoint_id: "opinions", item_id: opinionId }).then(resultData),
        cites: mcp
          .call("call_endpoint", {
            endpoint_id: "opinions-cited",
            query: { citing_opinion: opinionId },
            num_results: 100,
          })
          .then(resultData),
        citedBy: mcp
          .call("call_endpoint", {
            endpoint_id: "opinions-cited",
            query: { cited_opinion: opinionId },
            num_results: 100,
          })
          .then(resultData),
      });
      res.json({ opinionId, ...data });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/judges/:personId/workspace", async (req, res) => {
    try {
      const personId = integer(req.params.personId, "Person ID");
      const person = resultData(
        await mcp.call("get_endpoint_item", { endpoint_id: "people", item_id: personId }),
      );
      res.json({ personId, person });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/judges/:personId/section/:section", async (req, res) => {
    try {
      const personId = integer(req.params.personId, "Person ID");
      const section = text(req.params.section, "Judge section", 40);
      const definitions: Record<string, { endpoint: string; query: JsonObject }> = {
        positions: { endpoint: "positions", query: { person: personId } },
        education: { endpoint: "educations", query: { person: personId } },
        disclosures: {
          endpoint: "financial-disclosures",
          query: { person: personId, order_by: "-date_created" },
        },
        affiliations: { endpoint: "political-affiliations", query: { person: personId } },
      };
      const definition = definitions[section];
      if (!definition) throw new Error("Unsupported judge section");
      const data = resultData(
        await mcp.call("call_endpoint", {
          endpoint_id: definition.endpoint,
          query: definition.query,
          num_results: 100,
        }),
      );
      res.json({ section, data });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/disclosures/:disclosureId/workspace", async (req, res) => {
    try {
      const disclosureId = integer(req.params.disclosureId, "Disclosure ID");
      const disclosure = resultData(
        await mcp.call("get_endpoint_item", {
          endpoint_id: "financial-disclosures",
          item_id: disclosureId,
        }),
      );
      res.json({ disclosureId, disclosure });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/disclosures/:disclosureId/section/:section", async (req, res) => {
    try {
      const disclosureId = integer(req.params.disclosureId, "Disclosure ID");
      const section = text(req.params.section, "Disclosure section", 40);
      const endpoints = new Set([
        "investments",
        "debts",
        "gifts",
        "agreements",
        "non-investment-incomes",
        "disclosure-positions",
        "reimbursements",
        "spouse-incomes",
      ]);
      if (!endpoints.has(section)) throw new Error("Unsupported disclosure section");
      const data = resultData(
        await mcp.call("call_endpoint", {
          endpoint_id: section,
          query: { financial_disclosure: disclosureId },
          num_results: 100,
        }),
      );
      res.json({ section, data });
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.post("/api/documents/read", security.requireCsrf, async (req, res) => {
    try {
      const result = await mcp.call("read_document", objectBody(req.body));
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.post("/api/documents/search", security.requireCsrf, async (req, res) => {
    try {
      const result = await mcp.call("search_document", objectBody(req.body));
      res.json(result);
    } catch (error) {
      sendCourtListenerError(res, error);
    }
  });

  app.get("/api/alerts", async (_req, res) => {
    const data = await settledObject({
      searchAlerts: mcp
        .call("call_endpoint", { endpoint_id: "alerts", query: {}, num_results: 100 })
        .then(resultData),
      docketAlerts: mcp
        .call("call_endpoint", { endpoint_id: "docket-alerts", query: {}, num_results: 100 })
        .then(resultData),
      prayers: mcp
        .call("call_endpoint", { endpoint_id: "prayers", query: {}, num_results: 100 })
        .then(resultData),
    });
    res.json({ ...data, history: db.listActionAudit(100) });
  });

  app.get("/api/activity", (_req, res) => res.json({ activity: db.listActivity(100) }));
  app.get("/api/saved", (_req, res) => res.json({ saved: db.listSaved(500) }));
  app.post("/api/saved", security.requireCsrf, (req, res) => {
    try {
      const body = objectBody(req.body);
      const saved = db.saveResearch({
        kind: text(body.kind, "Type", 80),
        title: text(body.title, "Title", 300),
        subtitle: typeof body.subtitle === "string" ? body.subtitle : null,
        courtlistenerUrl: typeof body.courtlistenerUrl === "string" ? body.courtlistenerUrl : null,
        payload: body.payload ?? {},
      });
      res.status(201).json(saved);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.delete("/api/saved/:id", security.requireCsrf, (req, res) => {
    try {
      res.json({ deleted: db.deleteSaved(integer(req.params.id, "Saved research ID")) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected request error";
    res.status(400).json({ error: redactSecrets(message) });
  });

  const dist = join(process.cwd(), "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { etag: true, maxAge: "1h", index: false }));
    app.get("/{*path}", (_req, res) => res.sendFile(join(dist, "index.html")));
  }

  setInterval(() => {
    security.cleanup();
    const now = Date.now();
    for (const [id, challenge] of challenges) {
      if (Date.parse(challenge.expiresAt) <= now) challenges.delete(id);
    }
    for (const [key, bucket] of requestBuckets) {
      if (bucket.resetAt <= now) requestBuckets.delete(key);
    }
    for (const [opinionId, cached] of opinionTextCache) {
      if (cached.expiresAt <= now) opinionTextCache.delete(opinionId);
    }
  }, 60_000).unref();

  return app;
}
