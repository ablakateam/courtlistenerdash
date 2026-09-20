import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export class PasswordStore {
  constructor(
    private readonly filePath: string,
    private readonly bootstrapHash: string,
  ) {}

  async load(): Promise<string> {
    try {
      const value = (await readFile(this.filePath, "utf8")).trim();
      if (!value.startsWith("scrypt$")) throw new Error("Invalid administrator password hash");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.set(this.bootstrapHash);
      return this.bootstrapHash;
    }
  }

  async set(hash: string): Promise<void> {
    if (!hash.startsWith("scrypt$")) throw new Error("Refusing to store an unsupported password hash");
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(this.filePath), `.password-${process.pid}-${randomBytes(6).toString("hex")}`);
    await writeFile(temporary, `${hash}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, this.filePath);
    await chmod(this.filePath, 0o600);
  }
}
