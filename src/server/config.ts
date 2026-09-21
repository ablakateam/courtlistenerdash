import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function secretEnv(name: string): string {
  const direct = process.env[name];
  if (direct !== undefined) return direct;
  const filePath = process.env[`${name}_FILE`];
  if (!filePath) return "";
  try {
    return readFileSync(resolve(filePath), "utf8").trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${name}_FILE: ${message}`);
  }
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function lanUrls(port: number, tls: boolean): string[] {
  const scheme = tls ? "https" : "http";
  const suffix = (tls && port === 443) || (!tls && port === 80) ? "" : `:${port}`;
  const urls: string[] = [];
  for (const [interfaceName, values] of Object.entries(networkInterfaces())) {
    if (/^(docker|br-|veth)/.test(interfaceName)) continue;
    for (const address of values ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (
        address.address.startsWith("10.") ||
        address.address.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(address.address)
      ) {
        urls.push(`${scheme}://${address.address}${suffix}`);
      }
    }
  }
  return [...new Set(urls)].sort();
}

const port = intEnv("COURTLISTENER_WEB_PORT", 8788);
const publicPort = intEnv("COURTLISTENER_PUBLIC_PORT", port);
const tlsCertPath = process.env.COURTLISTENER_TLS_CERT
  ? resolve(process.env.COURTLISTENER_TLS_CERT)
  : null;
const tlsKeyPath = process.env.COURTLISTENER_TLS_KEY
  ? resolve(process.env.COURTLISTENER_TLS_KEY)
  : null;

export const config = {
  version: "1.4.1",
  host: process.env.COURTLISTENER_WEB_HOST || "0.0.0.0",
  port,
  publicPort,
  dataDir: resolve(process.env.COURTLISTENER_WEB_DATA_DIR || "./data"),
  mcpEndpoint:
    process.env.COURTLISTENER_MCP_URL || "https://mcp.courtlistener.com/",
  mcpHealthEndpoint:
    process.env.COURTLISTENER_MCP_HEALTH_URL ||
    "https://mcp.courtlistener.com/health",
  sessionSecret: secretEnv("COURTLISTENER_SESSION_SECRET"),
  credentialKey: secretEnv("COURTLISTENER_CREDENTIAL_KEY"),
  passwordHash: secretEnv("COURTLISTENER_WEB_PASSWORD_HASH"),
  bootstrapToken: secretEnv("COURTLISTENER_API_TOKEN"),
  bootstrapTypeSafeKey: secretEnv("TYPESAFE_API_KEY"),
  typeSafeModel: process.env.TYPESAFE_DEFAULT_MODEL || "jev-1.13.0",
  typeSafeMode: process.env.TYPESAFE_MODE || "off",
  tlsCertPath,
  tlsKeyPath,
  tlsEnabled: Boolean(tlsCertPath && tlsKeyPath),
  allowInsecureCredentialSetup: boolEnv(
    "COURTLISTENER_ALLOW_INSECURE_CREDENTIAL_SETUP",
    process.env.NODE_ENV !== "production",
  ),
  secureCookies: boolEnv(
    "COURTLISTENER_SECURE_COOKIES",
    Boolean(tlsCertPath && tlsKeyPath),
  ),
  trustProxy: boolEnv("COURTLISTENER_TRUST_PROXY", false),
  sessionTtlMs: intEnv("COURTLISTENER_SESSION_TTL_MINUTES", 480) * 60_000,
  requestTimeoutMs: intEnv("COURTLISTENER_REQUEST_TIMEOUT_MS", 45_000),
  aiRequestTimeoutMs: intEnv("LEGAL_AI_REQUEST_TIMEOUT_MS", 300_000),
  typeSafeRequestTimeoutMs: intEnv("TYPESAFE_REQUEST_TIMEOUT_MS", 15_000),
  maxRequestsPerMinute: intEnv("COURTLISTENER_REQUESTS_PER_MINUTE", 90),
  lanUrls: lanUrls(publicPort, Boolean(tlsCertPath && tlsKeyPath)),
};

export type AppConfig = typeof config;

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    missing.push("COURTLISTENER_SESSION_SECRET (at least 32 characters)");
  }
  if (!config.credentialKey) {
    missing.push("COURTLISTENER_CREDENTIAL_KEY (base64-encoded 32-byte key)");
  } else {
    const decoded = Buffer.from(config.credentialKey, "base64");
    if (decoded.length !== 32) {
      missing.push("COURTLISTENER_CREDENTIAL_KEY (must decode to 32 bytes)");
    }
  }
  if (!config.passwordHash) {
    missing.push("COURTLISTENER_WEB_PASSWORD_HASH");
  }
  if (Boolean(config.tlsCertPath) !== Boolean(config.tlsKeyPath)) {
    missing.push("both COURTLISTENER_TLS_CERT and COURTLISTENER_TLS_KEY");
  }
  if (missing.length) {
    throw new Error(`Missing or invalid secure configuration: ${missing.join(", ")}`);
  }
}
