import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TypeSafeMode } from "../shared/types.js";

export const TYPESAFE_ENDPOINT = "https://api.typesafe.ai" as const;
export const DEFAULT_TYPESAFE_MODEL = "jev-1.13.0";

export interface TypeSafeConfig {
  apiKey: string;
  model: string;
  mode: TypeSafeMode;
}

interface EncryptedConfigFile {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

export function normalizeTypeSafeConfig(value: unknown): TypeSafeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Jev configuration is required");
  }
  const input = value as Record<string, unknown>;
  const apiKey = String(input.apiKey ?? "").trim();
  const model = String(input.model ?? DEFAULT_TYPESAFE_MODEL).trim();
  const mode = String(input.mode ?? "evaluation") as TypeSafeMode;
  if (apiKey.length < 8 || apiKey.length > 5_000 || /[\r\n]/.test(apiKey)) {
    throw new Error("Enter a valid TypeSafe API key");
  }
  if (!/^jev-[A-Za-z0-9.-]+$/.test(model) || model.length > 100) {
    throw new Error("Enter a valid Jev model name");
  }
  if (!["off", "evaluation", "shadow", "active"].includes(mode)) {
    throw new Error("Unsupported Jev operating mode");
  }
  if (mode === "active" && /(?:latest|preview)$/i.test(model)) {
    throw new Error("Active mode requires a pinned Jev model version, such as jev-1.13.0");
  }
  return { apiKey, model, mode };
}

export class TypeSafeConfigStore {
  private cached: TypeSafeConfig | null | undefined;
  private readonly key: Buffer;

  constructor(
    private readonly filePath: string,
    keyBase64: string,
    private readonly bootstrap: TypeSafeConfig | null = null,
  ) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) throw new Error("Credential key must be exactly 32 bytes");
  }

  async get(): Promise<TypeSafeConfig | null> {
    if (this.cached !== undefined) return this.cached;
    try {
      const envelope = JSON.parse(await readFile(this.filePath, "utf8")) as EncryptedConfigFile;
      if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
        throw new Error("Unsupported Jev credential format");
      }
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      this.cached = normalizeTypeSafeConfig(JSON.parse(plaintext));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.cached = this.bootstrap ? normalizeTypeSafeConfig(this.bootstrap) : null;
    }
    return this.cached;
  }

  async set(value: TypeSafeConfig): Promise<void> {
    const normalized = normalizeTypeSafeConfig(value);
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
    const temporary = join(dirname(this.filePath), `.typesafe-config-${process.pid}-${randomBytes(6).toString("hex")}`);
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
}
