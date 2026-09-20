import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface EncryptedTokenFile {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

export class TokenStore {
  private cached: string | null | undefined;
  private readonly key: Buffer;

  constructor(
    private readonly filePath: string,
    keyBase64: string,
    private readonly bootstrapToken = "",
  ) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) throw new Error("Credential key must be exactly 32 bytes");
  }

  async get(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached;
    try {
      const envelope = JSON.parse(await readFile(this.filePath, "utf8")) as EncryptedTokenFile;
      if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
        throw new Error("Unsupported credential format");
      }
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      this.cached = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
      return this.cached;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.cached = this.bootstrapToken.trim() || null;
      return this.cached;
    }
  }

  async set(token: string): Promise<void> {
    const normalized = token.trim();
    if (normalized.length < 8 || /\s/.test(normalized)) {
      throw new Error("The CourtListener token is malformed");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
    const envelope: EncryptedTokenFile = {
      version: 1,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      updatedAt: new Date().toISOString(),
    };
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(this.filePath), `.credential-${process.pid}-${randomBytes(6).toString("hex")}`);
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
