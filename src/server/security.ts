import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export interface SessionRecord {
  id: string;
  csrf: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface SecurityOptions {
  passwordHash: string;
  sessionSecret: string;
  sessionTtlMs: number;
  secureCookies: boolean;
}

const COOKIE_NAME = "courtlistenerdash_session";

export async function hashPassword(password: string): Promise<string> {
  const problem = passwordStrengthProblem(password);
  if (problem) throw new Error(problem);
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function passwordStrengthProblem(password: string): string | null {
  if (password.length < 14) return "New password must be at least 14 characters";
  if (password.length > 1_000) return "New password is too long";
  const classes = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (classes < 3) return "Use at least three of: lowercase letters, uppercase letters, numbers, and symbols";
  if (/^(.)\1+$/.test(password) || /password|letmein|qwerty|courtlistener/i.test(password)) {
    return "Choose a less predictable password";
  }
  return null;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltB64, hashB64] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const derived = (await scrypt(password, Buffer.from(saltB64, "base64"), expected.length)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 1) return [];
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
    }),
  );
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export class SecurityManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly failures = new Map<string, { count: number; resetAt: number }>();
  private passwordHash: string;

  constructor(private readonly options: SecurityOptions) {
    this.passwordHash = options.passwordHash;
  }

  private cookieValue(sessionId: string): string {
    return `${sessionId}.${sign(sessionId, this.options.sessionSecret)}`;
  }

  private sessionFromRequest(req: Request): SessionRecord | null {
    const value = parseCookies(req)[COOKIE_NAME];
    if (!value) return null;
    const separator = value.lastIndexOf(".");
    if (separator < 1) return null;
    const id = value.slice(0, separator);
    const supplied = Buffer.from(value.slice(separator + 1));
    const expected = Buffer.from(sign(id, this.options.sessionSecret));
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    session.lastSeenAt = Date.now();
    session.expiresAt = Date.now() + this.options.sessionTtlMs;
    return session;
  }

  async login(req: Request, res: Response, password: string): Promise<SessionRecord> {
    const source = req.ip || req.socket.remoteAddress || "unknown";
    const failure = this.failures.get(source);
    if (failure && failure.resetAt > Date.now() && failure.count >= 8) {
      throw new Error("Too many login attempts. Try again in 15 minutes.");
    }
    const valid = await verifyPassword(password, this.passwordHash);
    if (!valid) {
      const current = failure && failure.resetAt > Date.now() ? failure.count : 0;
      this.failures.set(source, { count: current + 1, resetAt: Date.now() + 15 * 60_000 });
      throw new Error("Invalid credentials");
    }
    this.failures.delete(source);
    const id = randomBytes(32).toString("base64url");
    const session: SessionRecord = {
      id,
      csrf: randomBytes(24).toString("base64url"),
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      expiresAt: Date.now() + this.options.sessionTtlMs,
    };
    this.sessions.set(id, session);
    res.cookie(COOKIE_NAME, this.cookieValue(id), {
      httpOnly: true,
      sameSite: "strict",
      secure: this.options.secureCookies,
      path: "/",
      maxAge: this.options.sessionTtlMs,
    });
    return session;
  }

  verifyCurrentPassword(password: string): Promise<boolean> {
    return verifyPassword(password, this.passwordHash);
  }

  replacePasswordHash(hash: string, preserveSessionId?: string): void {
    this.passwordHash = hash;
    for (const id of this.sessions.keys()) {
      if (id !== preserveSessionId) this.sessions.delete(id);
    }
    this.failures.clear();
  }

  logout(req: Request, res: Response): void {
    const session = this.sessionFromRequest(req);
    if (session) this.sessions.delete(session.id);
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: "strict",
      secure: this.options.secureCookies,
      path: "/",
    });
  }

  session(req: Request): SessionRecord | null {
    return this.sessionFromRequest(req);
  }

  requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const session = this.sessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.locals.session = session;
    next();
  };

  requireCsrf = (req: Request, res: Response, next: NextFunction): void => {
    const session = (res.locals.session as SessionRecord | undefined) ?? this.sessionFromRequest(req);
    const supplied = req.header("x-csrf-token") || "";
    if (!session || supplied.length !== session.csrf.length) {
      res.status(403).json({ error: "Invalid request token" });
      return;
    }
    if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(session.csrf))) {
      res.status(403).json({ error: "Invalid request token" });
      return;
    }
    next();
  };

  cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
    for (const [key, failure] of this.failures) {
      if (failure.resetAt <= now) this.failures.delete(key);
    }
  }
}

export function redactSecrets<T>(value: T): T {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, item]) => [
          key,
          /token|authorization|password|secret|credential/i.test(key) ? "[REDACTED]" : visit(item),
        ]),
      );
    }
    if (typeof input === "string") {
      return input.replace(/(Authorization:\s*(?:Token|Bearer)\s+)[^\s"']+/gi, "$1[REDACTED]");
    }
    return input;
  };
  return visit(value) as T;
}
