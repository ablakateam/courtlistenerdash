import { randomBytes } from "node:crypto";
import { hashPassword } from "./security.js";

const command = process.argv[2];

if (command === "key") {
  process.stdout.write(`${randomBytes(32).toString("base64")}\n`);
} else if (command === "secret") {
  process.stdout.write(`${randomBytes(48).toString("base64url")}\n`);
} else if (command === "password") {
  const password = process.argv[3] || "";
  if (!password) {
    process.stderr.write("Usage: npm run credential -- password '<strong password>'\n");
    process.exitCode = 2;
  } else {
    process.stdout.write(`${await hashPassword(password)}\n`);
  }
} else {
  process.stderr.write("Usage: npm run credential -- key|secret|password\n");
  process.exitCode = 2;
}
