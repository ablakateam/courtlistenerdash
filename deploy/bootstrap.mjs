import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const target = resolve(process.argv[2] || "secrets");
const files = {
  session_secret: randomBytes(48).toString("base64url"),
  credential_key: randomBytes(32).toString("base64"),
};

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

await mkdir(target, { recursive: true, mode: 0o700 });
await chmod(target, 0o700);

const paths = [...Object.keys(files), "admin_password_hash"].map((name) => resolve(target, name));
if ((await Promise.all(paths.map(exists))).some(Boolean)) {
  throw new Error(`Refusing to overwrite existing bootstrap secrets in ${target}`);
}

const password = `CLD!${randomBytes(21).toString("base64url")}7z`;
const salt = randomBytes(16);
const derived = await scrypt(password, salt, 64);
files.admin_password_hash = `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;

for (const [name, value] of Object.entries(files)) {
  await writeFile(resolve(target, name), `${value}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

process.stdout.write(`Created deployment secrets in ${target}\n`);
process.stdout.write(`One-time initial dashboard password: ${password}\n`);
process.stdout.write("Save this password now. It is not stored in plaintext and will not be shown again.\n");
