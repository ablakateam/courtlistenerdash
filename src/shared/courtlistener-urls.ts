export interface CourtListenerAudioSource {
  streamUrl: string | null;
  originalUrl: string | null;
  isCourtListenerCopy: boolean;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeHttpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function courtListenerStorageUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const existing = new URL(raw);
    return existing.protocol === "https:" && existing.hostname === "storage.courtlistener.com"
      ? existing.href
      : null;
  } catch {
    const path = raw.replace(/^\/+/, "");
    if (!path || path.split("/").some((part) => part === "..")) return null;
    return new URL(path, "https://storage.courtlistener.com/").href;
  }
}

export function courtListenerAudioSource(record: Record<string, unknown>): CourtListenerAudioSource {
  const stored = courtListenerStorageUrl(record.local_path_mp3 ?? record.filepath_ia);
  const original = safeHttpUrl(record.download_url ?? record.download_url_mp3 ?? record.audio_url);
  if (stored) return { streamUrl: stored, originalUrl: original, isCourtListenerCopy: true };
  if (original?.startsWith("https://")) {
    return { streamUrl: original, originalUrl: original, isCourtListenerCopy: false };
  }
  return { streamUrl: null, originalUrl: original, isCourtListenerCopy: false };
}

export function courtListenerFileUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (raw.startsWith("/")) return new URL(raw, "https://www.courtlistener.com").href;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "courtlistener.com" || url.hostname.endsWith(".courtlistener.com")) return url.href;
    return null;
  } catch {
    return null;
  }
}
