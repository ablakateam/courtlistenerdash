import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LegalAiProvider } from "../shared/types.js";

export interface LegalAiConfig {
  provider: LegalAiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface EncryptedConfigFile {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

function normalizedBaseUrl(value: string, provider: LegalAiProvider): string {
  const fallback = provider === "ollama"
    ? "http://127.0.0.1:11434"
    : provider === "anthropic"
      ? "https://api.anthropic.com/v1"
      : "https://api.openai.com/v1";
  const url = new URL(value.trim() || fallback);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("The AI endpoint must use HTTPS unless it is a loopback-only local service");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/$/, "");
}

export function normalizeLegalAiConfig(value: unknown): LegalAiConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI configuration is required");
  const input = value as Record<string, unknown>;
  const provider = String(input.provider ?? "") as LegalAiProvider;
  if (!["ollama", "openai", "anthropic"].includes(provider)) throw new Error("Unsupported AI provider");
  const model = String(input.model ?? "").trim();
  if (!model || model.length > 160 || !/^[\w./:@+-]+$/.test(model)) throw new Error("Enter a valid AI model name");
  const apiKey = String(input.apiKey ?? "").trim();
  if (provider !== "ollama" && apiKey.length < 8) throw new Error("This AI provider requires an API key");
  if (apiKey.length > 5_000 || /[\r\n]/.test(apiKey)) throw new Error("The AI API key is malformed");
  return {
    provider,
    baseUrl: normalizedBaseUrl(String(input.baseUrl ?? ""), provider),
    model,
    apiKey,
  };
}

export class LegalAiConfigStore {
  private cached: LegalAiConfig | null | undefined;
  private readonly key: Buffer;

  constructor(private readonly filePath: string, keyBase64: string) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) throw new Error("Credential key must be exactly 32 bytes");
  }

  async get(): Promise<LegalAiConfig | null> {
    if (this.cached !== undefined) return this.cached;
    try {
      const envelope = JSON.parse(await readFile(this.filePath, "utf8")) as EncryptedConfigFile;
      if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") throw new Error("Unsupported AI credential format");
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      this.cached = normalizeLegalAiConfig(JSON.parse(plaintext));
      return this.cached;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.cached = null;
      return null;
    }
  }

  async set(value: LegalAiConfig): Promise<void> {
    const normalized = normalizeLegalAiConfig(value);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(normalized), "utf8"),
      cipher.final(),
    ]);
    const envelope: EncryptedConfigFile = {
      version: 1,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      updatedAt: new Date().toISOString(),
    };
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(this.filePath), `.ai-config-${process.pid}-${randomBytes(6).toString("hex")}`);
    await writeFile(temporary, `${JSON.stringify(envelope)}\n`, { mode: 0o600, flag: "wx" });
    await chmod(temporary, 0o600);
    await rename(temporary, this.filePath);
    this.cached = normalized;
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.cached = null;
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.get());
  }
}
