import { randomBytes } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.env.COURTLISTENER_ENV_FILE) {
  const lines = readFileSync(process.env.COURTLISTENER_ENV_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    if (process.env[name] === undefined) process.env[name] = line.slice(separator + 1);
  }
}

const reviewPassword = process.env.COURTLISTENER_REVIEW_PASSWORD;
if (!reviewPassword || reviewPassword.length < 16) {
  throw new Error("COURTLISTENER_REVIEW_PASSWORD must contain at least 16 characters");
}

const { createApp } = await import("../dist-server/server/app.js");
const { config, validateConfig } = await import("../dist-server/server/config.js");
const { AppDatabase } = await import("../dist-server/server/database.js");
const { CourtListenerMcpClient } = await import("../dist-server/server/mcp-client.js");
const { SecurityManager, hashPassword } = await import("../dist-server/server/security.js");
const { TokenStore } = await import("../dist-server/server/token-store.js");
const { PasswordStore } = await import("../dist-server/server/password-store.js");
const { LegalAiConfigStore } = await import("../dist-server/server/ai-config-store.js");
const { LegalAiClient } = await import("../dist-server/server/legal-ai.js");
const { TypeSafeConfigStore } = await import("../dist-server/server/typesafe-config-store.js");
const { TypeSafeDecisionService } = await import("../dist-server/server/typesafe-decision-service.js");

validateConfig();
const port = Math.max(1024, Number(process.env.COURTLISTENER_REVIEW_PORT) || 8890);
const reviewDirectory = mkdtempSync(join(tmpdir(), "courtlistenerdash-review-"));
const passwordHash = await hashPassword(reviewPassword);
const reviewConfig = {
  ...config,
  version: `${config.version}-review`,
  host: "127.0.0.1",
  port,
  publicPort: port,
  dataDir: reviewDirectory,
  sessionSecret: randomBytes(48).toString("base64url"),
  passwordHash,
  tlsCertPath: null,
  tlsKeyPath: null,
  tlsEnabled: false,
  secureCookies: false,
  trustProxy: false,
  allowInsecureCredentialSetup: false,
  lanUrls: [`http://127.0.0.1:${port}`],
};

// The isolated review server reads the configured credential but never copies it
// into browser state. Its database, password, sessions, and AI settings are temporary.
const tokenStore = new TokenStore(
  join(config.dataDir, "courtlistener-token.enc"),
  config.credentialKey,
  config.bootstrapToken,
);
const database = new AppDatabase(join(reviewDirectory, "review.sqlite3"));
const passwordStore = new PasswordStore(join(reviewDirectory, "review-password.hash"), passwordHash);
const aiConfigStore = new LegalAiConfigStore(join(reviewDirectory, "review-ai.enc"), config.credentialKey);
const legalAi = new LegalAiClient(aiConfigStore, reviewConfig.aiRequestTimeoutMs);
const typeSafeConfigStore = new TypeSafeConfigStore(join(reviewDirectory, "review-typesafe.enc"), config.credentialKey);
const typeSafe = new TypeSafeDecisionService(typeSafeConfigStore, database, reviewConfig.typeSafeRequestTimeoutMs);
const security = new SecurityManager({
  passwordHash,
  sessionSecret: reviewConfig.sessionSecret,
  sessionTtlMs: reviewConfig.sessionTtlMs,
  secureCookies: false,
});
const mcp = new CourtListenerMcpClient({
  endpoint: reviewConfig.mcpEndpoint,
  timeoutMs: reviewConfig.requestTimeoutMs,
  getToken: () => tokenStore.get(),
});
const app = createApp({
  config: reviewConfig,
  security,
  tokenStore,
  mcp,
  db: database,
  passwordStore,
  aiConfigStore,
  legalAi,
  typeSafeConfigStore,
  typeSafe,
});
const server = createServer(app);

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`CourtListenerDash isolated review server listening on http://127.0.0.1:${port}\n`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise((resolve) => server.close(resolve));
  await mcp.disconnect();
  database.close();
  rmSync(reviewDirectory, { recursive: true, force: true });
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
