import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server/app.js";
import type { AppConfig } from "../src/server/config.js";
import { AppDatabase } from "../src/server/database.js";
import type { CourtListenerMcpClient } from "../src/server/mcp-client.js";
import { SecurityManager, hashPassword } from "../src/server/security.js";
import { TokenStore } from "../src/server/token-store.js";
import { PasswordStore } from "../src/server/password-store.js";
import { LegalAiConfigStore } from "../src/server/ai-config-store.js";
import { LegalAiClient } from "../src/server/legal-ai.js";
import { TypeSafeConfigStore } from "../src/server/typesafe-config-store.js";
import { TypeSafeDecisionService } from "../src/server/typesafe-decision-service.js";

test("authenticated dashboard can validate and store a token without returning it", async () => {
  const directory = join(tmpdir(), `courtlistenerdash-app-${randomBytes(8).toString("hex")}`);
  const password = "An adequately long admin credential! 42";
  const initialHash = await hashPassword(password);
  const security = new SecurityManager({
    passwordHash: initialHash,
    sessionSecret: randomBytes(48).toString("base64url"),
    sessionTtlMs: 60_000,
    secureCookies: false,
  });
  const tokenStore = new TokenStore(join(directory, "token.enc"), randomBytes(32).toString("base64"));
  const passwordStore = new PasswordStore(join(directory, "password.hash"), initialHash);
  const aiConfigStore = new LegalAiConfigStore(join(directory, "ai.enc"), randomBytes(32).toString("base64"));
  const legalAi = new LegalAiClient(aiConfigStore, 5_000);
  const db = new AppDatabase(join(directory, "app.sqlite3"));
  const typeSafeConfigStore = new TypeSafeConfigStore(join(directory, "typesafe.enc"), randomBytes(32).toString("base64"));
  const typeSafe = new TypeSafeDecisionService(typeSafeConfigStore, db, 5_000);
  typeSafe.validate = async (candidate) => ({ actualModel: candidate.model, models: [] });
  const fakeMcp = {
    async testCredential() { return { toolCount: 19, tools: [] }; },
    async disconnect() {},
    async listTools() { return []; },
    async call() { return { tool: "get_api_usage", data: {}, raw: {}, durationMs: 1, calledAt: new Date().toISOString() }; },
    status() { return { connected: false, toolCount: 0, lastSuccess: null, lastError: null }; },
    getEvents() { return []; },
  } as unknown as CourtListenerMcpClient;
  const config = {
    version: "test",
    host: "127.0.0.1",
    port: 0,
    publicPort: 0,
    dataDir: directory,
    mcpEndpoint: "https://mcp.courtlistener.com/",
    mcpHealthEndpoint: "https://mcp.courtlistener.com/health",
    sessionSecret: "unused",
    credentialKey: "unused",
    passwordHash: "unused",
    bootstrapToken: "",
    tlsCertPath: null,
    tlsKeyPath: null,
    tlsEnabled: false,
    allowInsecureCredentialSetup: true,
    secureCookies: false,
    trustProxy: false,
    sessionTtlMs: 60_000,
    requestTimeoutMs: 5_000,
    aiRequestTimeoutMs: 5_000,
    maxRequestsPerMinute: 100,
    lanUrls: [],
  } as AppConfig;
  const app = createApp({ config, security, tokenStore, mcp: fakeMcp, db, passwordStore, aiConfigStore, legalAi, typeSafeConfigStore, typeSafe });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const loginBody = (await login.json()) as { csrfToken: string };
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const secret = "courtlistener-test-token-not-real";
    const saved = await fetch(`${base}/api/connections/courtlistener`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-csrf-token": loginBody.csrfToken,
      },
      body: JSON.stringify({ token: secret }),
    });
    assert.equal(saved.status, 200);
    const responseText = await saved.text();
    assert.equal(responseText.includes(secret), false);
    assert.equal(await tokenStore.get(), secret);

    const typeSafeSecret = "typesafe-api-key-test-not-real";
    const typeSafeSaved = await fetch(`${base}/api/connections/typesafe`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-csrf-token": loginBody.csrfToken,
      },
      body: JSON.stringify({ apiKey: typeSafeSecret, model: "jev-1.13.0", mode: "shadow" }),
    });
    assert.equal(typeSafeSaved.status, 200);
    const typeSafeResponse = await typeSafeSaved.text();
    assert.equal(typeSafeResponse.includes(typeSafeSecret), false);
    assert.deepEqual(await typeSafeConfigStore.get(), { apiKey: typeSafeSecret, model: "jev-1.13.0", mode: "shadow" });

    const newPassword = "A much stronger replacement passphrase! 82";
    const changed = await fetch(`${base}/api/auth/password`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-csrf-token": loginBody.csrfToken,
      },
      body: JSON.stringify({ currentPassword: password, newPassword, confirmation: newPassword }),
    });
    assert.equal(changed.status, 200);
    assert.equal(await security.verifyCurrentPassword(password), false);
    assert.equal(await security.verifyCurrentPassword(newPassword), true);
    assert.equal((await passwordStore.load()).includes(newPassword), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("legal workspaces use live-supported CourtListener filters and lazy docket sections", async () => {
  const directory = join(tmpdir(), `courtlistener-workspaces-${randomBytes(8).toString("hex")}`);
  const password = "A separate workspace test credential! 73";
  const initialHash = await hashPassword(password);
  const security = new SecurityManager({
    passwordHash: initialHash,
    sessionSecret: randomBytes(48).toString("base64url"),
    sessionTtlMs: 60_000,
    secureCookies: false,
  });
  const tokenStore = new TokenStore(join(directory, "token.enc"), randomBytes(32).toString("base64"));
  const passwordStore = new PasswordStore(join(directory, "password.hash"), initialHash);
  const aiConfigStore = new LegalAiConfigStore(join(directory, "ai.enc"), randomBytes(32).toString("base64"));
  const legalAi = new LegalAiClient(aiConfigStore, 5_000);
  const db = new AppDatabase(join(directory, "app.sqlite3"));
  const typeSafeConfigStore = new TypeSafeConfigStore(join(directory, "typesafe.enc"), randomBytes(32).toString("base64"));
  const typeSafe = new TypeSafeDecisionService(typeSafeConfigStore, db, 5_000);
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const fakeMcp = {
    async call(tool: string, args: Record<string, unknown>) {
      calls.push({ tool, args });
      if (tool === "search") return { data: { results: [{ id: 1 }] }, durationMs: 1 };
      if (tool === "get_endpoint_item") {
        if (args.endpoint_id === "rate-limit-test") throw new Error("Rate limit exceeded: 100/hour. Expected available in 120 seconds.");
        const failures: Record<string, string> = {
          "authentication-test": "401 Unauthorized: invalid API token",
          "timeout-test": "Request timed out while waiting for CourtListener",
          "invalid-filter-test": "Validation error: invalid value for court",
          "missing-record-test": "404 not found",
          "network-test": "Transport network unavailable",
          "unknown-failure-test": "Unexpected upstream response",
        };
        if (typeof args.endpoint_id === "string" && failures[args.endpoint_id]) throw new Error(failures[args.endpoint_id]);
        if (args.endpoint_id === "dockets") return { data: { id: args.item_id, case_name: "Known federal matter" } };
        if (args.endpoint_id === "audio") return { data: { id: args.item_id, case_name: "Known argument", local_path_mp3: "mp3/known.mp3" } };
        if (args.endpoint_id === "people") return { data: { id: args.item_id, name_first: "Known", name_last: "Judge" } };
        if (args.endpoint_id === "financial-disclosures") return { data: { id: args.item_id, year: 2022 } };
      }
      return { data: { results: [{ id: 1 }] } };
    },
    async disconnect() {},
    async listTools() { return []; },
    status() { return { connected: true, toolCount: 19, lastSuccess: null, lastError: null }; },
    getEvents() { return []; },
  } as unknown as CourtListenerMcpClient;
  const config = {
    version: "test",
    host: "127.0.0.1",
    port: 0,
    publicPort: 0,
    dataDir: directory,
    mcpEndpoint: "https://mcp.courtlistener.com/",
    mcpHealthEndpoint: "https://mcp.courtlistener.com/health",
    sessionSecret: "unused",
    credentialKey: "unused",
    passwordHash: "unused",
    bootstrapToken: "",
    tlsCertPath: null,
    tlsKeyPath: null,
    tlsEnabled: false,
    allowInsecureCredentialSetup: true,
    secureCookies: false,
    trustProxy: false,
    sessionTtlMs: 60_000,
    requestTimeoutMs: 5_000,
    aiRequestTimeoutMs: 5_000,
    maxRequestsPerMinute: 100,
    lanUrls: [],
  } as AppConfig;
  const app = createApp({ config, security, tokenStore, mcp: fakeMcp, db, passwordStore, aiConfigStore, legalAi, typeSafeConfigStore, typeSafe });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    assert.equal(login.status, 200);
    const loginBody = (await login.json()) as { csrfToken: string };

    const exactCitation = await fetch(`${base}/api/search`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-csrf-token": loginBody.csrfToken },
      body: JSON.stringify({ query: "", citation: "347 U.S. 483", type: "o", numResults: 20 }),
    });
    const exactCitationBody = await exactCitation.text();
    assert.equal(exactCitation.status, 200, exactCitationBody);
    assert.deepEqual(calls.find((item) => item.tool === "search")?.args, {
      type: "o",
      citation: "347 U.S. 483",
      num_results: 20,
    });

    const rateLimited = await fetch(`${base}/api/items/rate-limit-test/1`, { headers: { cookie } });
    assert.equal(rateLimited.status, 429);
    assert.deepEqual(await rateLimited.json(), {
      code: "courtlistener_rate_limited",
      error: "CourtListener's hourly limit has been reached. Check the allowance meter in the header before trying again.",
    });

    const classifiedFailures = [
      ["authentication-test", 503, "courtlistener_authentication"],
      ["timeout-test", 504, "courtlistener_timeout"],
      ["invalid-filter-test", 400, "invalid_courtlistener_request"],
      ["missing-record-test", 404, "courtlistener_not_found"],
      ["network-test", 503, "courtlistener_unavailable"],
      ["unknown-failure-test", 502, "courtlistener_request_failed"],
    ] as const;
    for (const [endpoint, status, code] of classifiedFailures) {
      const response = await fetch(`${base}/api/items/${endpoint}/1`, { headers: { cookie } });
      assert.equal(response.status, status, endpoint);
      assert.equal(((await response.json()) as { code: string }).code, code, endpoint);
    }

    const more = await fetch(`${base}/api/search/more`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-csrf-token": loginBody.csrfToken },
      body: JSON.stringify({ queryId: "known-query:1", numResults: 20 }),
    });
    assert.equal(more.status, 200);
    assert.deepEqual(calls.find((item) => item.tool === "get_more_results")?.args, { query_id: "known-query:1", num_results: 20 });

    const summary = await fetch(`${base}/api/dockets/67490071/workspace`, { headers: { cookie } });
    assert.equal(summary.status, 200);
    assert.equal(calls.filter((item) => item.tool === "get_endpoint_item" && item.args.endpoint_id === "dockets").length, 1);
    assert.equal(calls.filter((item) => item.tool === "call_endpoint").length, 0, "docket tabs must not load eagerly");

    const documents = await fetch(`${base}/api/dockets/67490071/section/documents`, { headers: { cookie } });
    assert.equal(documents.status, 200);
    const documentCall = calls.find((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "recap-documents");
    assert.deepEqual(documentCall?.args.query, { docket_entry: { docket: 67490071 } });

    const attorneyCallsBefore = calls.filter((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "attorneys").length;
    const caseParties = await fetch(`${base}/api/cases/1/section/participants?docketId=67490071&mode=party`, { headers: { cookie } });
    assert.equal(caseParties.status, 200);
    assert.equal(calls.filter((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "parties").length, 1);
    assert.equal(calls.filter((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "attorneys").length, attorneyCallsBefore, "opening parties must not load attorneys");

    const caseTimeline = await fetch(`${base}/api/cases/1/section/docket?docketId=67490071&mode=timeline`, { headers: { cookie } });
    assert.equal(caseTimeline.status, 200);
    const timelineCall = calls.find((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "docket-entries");
    assert.deepEqual(timelineCall?.args.query, { docket: 67490071, order_by: "date_filed" });

    const audio = await fetch(`${base}/api/oral-arguments/106409/workspace`, { headers: { cookie } });
    assert.equal(audio.status, 200);

    const judge = await fetch(`${base}/api/judges/3045/workspace`, { headers: { cookie } });
    assert.equal(judge.status, 200);
    assert.equal(calls.filter((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "financial-disclosures").length, 0, "judge tabs must not load eagerly");

    const judgeDisclosures = await fetch(`${base}/api/judges/3045/section/disclosures`, { headers: { cookie } });
    assert.equal(judgeDisclosures.status, 200);
    const disclosureCall = calls.find((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "financial-disclosures");
    assert.deepEqual(disclosureCall?.args.query, { person: 3045, order_by: "-date_created" });

    const disclosure = await fetch(`${base}/api/disclosures/34207/workspace`, { headers: { cookie } });
    assert.equal(disclosure.status, 200);
    assert.equal(calls.filter((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "investments").length, 0, "disclosure tabs must not load eagerly");

    const investments = await fetch(`${base}/api/disclosures/34207/section/investments`, { headers: { cookie } });
    assert.equal(investments.status, 200);
    const investmentCall = calls.find((item) => item.tool === "call_endpoint" && item.args.endpoint_id === "investments");
    assert.deepEqual(investmentCall?.args.query, { financial_disclosure: 34207 });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
