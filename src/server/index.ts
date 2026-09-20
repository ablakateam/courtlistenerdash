import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { join } from "node:path";
import { createApp } from "./app.js";
import { config, validateConfig } from "./config.js";
import { AppDatabase } from "./database.js";
import { CourtListenerMcpClient } from "./mcp-client.js";
import { SecurityManager } from "./security.js";
import { TokenStore } from "./token-store.js";
import { PasswordStore } from "./password-store.js";
import { LegalAiConfigStore } from "./ai-config-store.js";
import { LegalAiClient } from "./legal-ai.js";

validateConfig();

const tokenStore = new TokenStore(
  join(config.dataDir, "courtlistener-token.enc"),
  config.credentialKey,
  config.bootstrapToken,
);
const database = new AppDatabase(join(config.dataDir, "courtlistener-console.sqlite3"));
const passwordStore = new PasswordStore(join(config.dataDir, "administrator-password.hash"), config.passwordHash);
const aiConfigStore = new LegalAiConfigStore(join(config.dataDir, "legal-ai-config.enc"), config.credentialKey);
const legalAi = new LegalAiClient(aiConfigStore, config.aiRequestTimeoutMs);
const activePasswordHash = await passwordStore.load();
const security = new SecurityManager({
  passwordHash: activePasswordHash,
  sessionSecret: config.sessionSecret,
  sessionTtlMs: config.sessionTtlMs,
  secureCookies: config.secureCookies,
});
const mcp = new CourtListenerMcpClient({
  endpoint: config.mcpEndpoint,
  timeoutMs: config.requestTimeoutMs,
  getToken: () => tokenStore.get(),
});

const app = createApp({ config, security, tokenStore, mcp, db: database, passwordStore, aiConfigStore, legalAi });
const server = config.tlsEnabled
  ? createHttpsServer(
      {
        cert: readFileSync(config.tlsCertPath!),
        key: readFileSync(config.tlsKeyPath!),
        minVersion: "TLSv1.2",
      },
      app,
    )
  : createHttpServer(app);

server.listen(config.port, config.host, () => {
  const scheme = config.tlsEnabled ? "https" : "http";
  process.stdout.write(`CourtListenerDash ${config.version} listening on ${scheme}://${config.host}:${config.port}\n`);
});

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(`Received ${signal}; shutting down CourtListener Console\n`);
  server.close();
  await mcp.disconnect();
  database.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
