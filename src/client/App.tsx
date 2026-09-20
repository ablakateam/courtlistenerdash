import {
  Activity,
  AlertTriangle,
  AudioLines,
  BadgeCheck,
  Bell,
  Bookmark,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FileSearch,
  Gavel,
  GitFork,
  Home,
  KeyRound,
  Landmark,
  LoaderCircle,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundSearch,
  Users,
  Volume2,
  X,
  XCircle,
  Copy,
  CalendarDays,
  UserRound,
  Quote,
  MessageSquare,
  Target,
  ListChecks,
  CircleCheckBig,
} from "lucide-react";
import DOMPurify from "dompurify";
import {
  type FormEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type {
  ActivityRecord,
  ApiUsageSummary,
  CaseAnalysisState,
  ConfirmationChallenge,
  ConnectionStatus,
  ConsoleEvent,
  JsonObject,
  McpToolDefinition,
  SavedResearch,
  GroundedAnswer,
  GroundedClaim,
  LegalAiStatus,
  SemanticResearchIntent,
  SourcePassage,
  ToolCoverageRow,
  ToolResult,
} from "../shared/types";
import {
  courtListenerAudioSource,
  courtListenerFileUrl,
} from "../shared/courtlistener-urls";
import { ApiError, api, del, post, put, setCsrf } from "./api";

type Notice = { kind: "success" | "error" | "info"; message: string };
const NoticeContext = createContext<(notice: Notice) => void>(() => undefined);
const readRequestCache = new Map<string, Promise<unknown>>();

function cachedApi<T>(path: string): Promise<T> {
  const existing = readRequestCache.get(path);
  if (existing) return existing as Promise<T>;
  const request = api<T>(path).catch((error) => {
    readRequestCache.delete(path);
    throw error;
  });
  readRequestCache.set(path, request);
  return request;
}

function useNotice(): (notice: Notice) => void {
  return useContext(NoticeContext);
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function records(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as JsonObject[];
  const object = asObject(value);
  if (Array.isArray(object.results)) return records(object.results);
  if (object.data) return records(object.data);
  return [];
}

function first(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    if (Array.isArray(value) && value.length) return value.map(String).join(", ");
  }
  return "";
}

function courtDisplay(...values: unknown[]): string {
  for (const value of values) {
    const object = asObject(value);
    const raw = first(
      object.full_name,
      object.short_name,
      object.citation_string,
      object.display_name,
      object.id,
      object.resource_uri,
      value,
    );
    if (!raw) continue;
    const resourceCode = raw.match(/\/courts\/([^/]+)\/?(?:\?.*)?$/i)?.[1];
    if (resourceCode) return resourceCode.toUpperCase();
    if (/^[a-z][a-z0-9-]{1,15}$/.test(raw)) return raw.toUpperCase();
    return raw;
  }
  return "";
}

function returnedError(value: unknown): string {
  return first(asObject(value).error);
}

function idFrom(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  const raw = first(value);
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/\/(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function absoluteCourtListenerUrl(value: unknown): string | null {
  const raw = first(value);
  if (!raw) return null;
  if (raw.startsWith("https://www.courtlistener.com/") || raw.startsWith("https://courtlistener.com/")) return raw;
  if (raw.startsWith("/")) return `https://www.courtlistener.com${raw}`;
  return null;
}

function formatDate(value: unknown): string {
  const raw = first(value);
  if (!raw) return "Date unavailable";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", ...( /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { timeZone: "UTC" } : {} ) }).format(parsed);
}

function formatCitations(value: unknown): string {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") return String(item);
      const row = asObject(item);
      return first(row.cite, row.citation, row.volume && row.reporter && row.page ? `${row.volume} ${row.reporter} ${row.page}` : "");
    })
    .filter(Boolean)
    .join("; ");
}

function stripMarkup(value: unknown): string {
  const raw = first(value);
  if (!raw) return "";
  if (typeof document === "undefined") return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parsed = new DOMParser().parseFromString(raw, "text/html");
  return (parsed.body.textContent || "").replace(/\s+/g, " ").trim();
}

function safeDocumentUrl(value: unknown): string | null {
  return courtListenerFileUrl(value);
}

function humanize(value: unknown): string {
  return first(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function looksLikeReporterCitation(value: string): boolean {
  return /^\s*\d+\s+[A-Za-z][A-Za-z0-9. ]{0,40}\s+\d+(?:\s*\(\d{4}\))?\s*$/.test(value);
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const terms = [...new Set(query.split(/\s+/).map((term) => term.replace(/[^\p{L}\p{N}.-]/gu, "")).filter((term) => term.length > 2))];
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  return <>{text.split(pattern).map((part, index) => terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? <mark key={`${part}-${index}`}>{part}</mark> : part)}</>;
}

function UsageIndicator({ usage }: { usage: ApiUsageSummary | null }) {
  if (!usage?.day) return <div className="usage-chip muted-usage"><Database size={16} /><span>Usage unavailable</span></div>;
  const dailyPercent = Math.min(100, Math.round((usage.day.used / Math.max(usage.day.limit, 1)) * 100));
  const resetLabel = usage.day.resetAt ? formatDate(usage.day.resetAt) : "rolling window";
  return (
    <details className="usage-menu">
      <summary className="usage-chip" title="CourtListener API usage">
        <Database size={16} />
        <span><strong>{usage.day.remaining}</strong> of {usage.day.limit} left / day</span>
        <span className="usage-mini-track"><i style={{ width: `${dailyPercent}%` }} /></span>
        <ChevronDown size={14} />
      </summary>
      <div className="usage-popover">
        <div className="usage-popover-head"><span className="eyebrow">CourtListener allowance</span><strong>{usage.fourteenDayTotal} requests in the past 14 days</strong></div>
        {[usage.minute, usage.hour, usage.day].filter(Boolean).map((limit) => {
          const row = limit!;
          const percent = Math.min(100, Math.round((row.used / Math.max(row.limit, 1)) * 100));
          return <div className="usage-row" key={row.rate}><div><strong>{row.rate}</strong><span>{row.used} used · {row.remaining} remaining</span></div><div className="usage-track"><i className={percent >= 85 ? "critical" : percent >= 65 ? "warning" : ""} style={{ width: `${percent}%` }} /></div></div>;
        })}
        <p>Daily availability resets on a rolling basis; next change: {resetLabel}. Usage checked {formatDate(usage.checkedAt)}.</p>
      </div>
    </details>
  );
}

function JsonBlock({ value, collapsed = false }: { value: unknown; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div className="json-block">
      <button className="json-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        <Code2 size={14} /> {open ? "Hide raw JSON" : "Show raw JSON"}
      </button>
      {open && <pre>{JSON.stringify(value, null, 2)}</pre>}
    </div>
  );
}

function Loading({ label = "Loading CourtListener data…" }: { label?: string }) {
  return (
    <div className="loading-panel">
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = /connected|available|healthy|success|verified|active/i.test(status)
    ? "good"
    : /error|unavailable|bad|failed|not located/i.test(status)
      ? "bad"
      : "warn";
  return <span className={`status-pill ${tone}`}>{status}</span>;
}

function useLoad<T>(loader: () => Promise<T>, dependencies: unknown[] = []): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loader()
      .then((value) => active && setData(value))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, revision]);
  return { data, error, loading, reload };
}

function Login({ onLogin }: { onLogin: (csrf: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await post<{ authenticated: boolean; csrfToken: string }>("/api/auth/login", { password });
      setCsrf(result.csrfToken);
      onLogin(result.csrfToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark large"><Scale size={28} /></div>
        <span className="eyebrow">CourtListener legal intelligence</span>
        <h1>CourtListener Console</h1>
        <p>Private, LAN-hosted research across opinions, RECAP dockets, citations, oral arguments, and judicial records.</p>
        <form onSubmit={submit}>
          <label>
            Administrator password
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter your dashboard password"
            />
          </label>
          {error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}
          <button className="primary wide" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
            Sign in securely
          </button>
        </form>
        <div className="login-foot"><KeyRound size={14} /> Your CourtListener token is never sent to the browser after setup.</div>
      </section>
    </main>
  );
}

const navGroups = [
  {
    label: "Research",
    links: [
      ["/", "Dashboard", Home],
      ["/research", "Legal Research", Search],
      ["/semantic", "Semantic Search", Sparkles],
      ["/saved", "Saved Research", Bookmark],
    ],
  },
  {
    label: "Explore",
    links: [
      ["/cases", "Cases & Opinions", BookOpen],
      ["/dockets", "PACER / RECAP", BriefcaseBusiness],
      ["/citations", "Citation Network", GitFork],
      ["/verify", "Citation Verification", FileCheck2],
      ["/oral-arguments", "Oral Arguments", AudioLines],
      ["/judges", "Judges", Gavel],
      ["/disclosures", "Financial Disclosures", CircleDollarSign],
      ["/alerts", "Alerts", Bell],
    ],
  },
  {
    label: "Advanced",
    links: [
      ["/mcp", "MCP Console", Bot],
      ["/api-explorer", "API Explorer", Code2],
      ["/settings", "Settings", Settings],
    ],
  },
] as const;

function Layout({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const status = useLoad(() => api<ConnectionStatus & { tls: boolean }>("/api/status"), [location.pathname]);
  const usage = useLoad(() => api<ApiUsageSummary>("/api/usage"));
  useEffect(() => {
    const timer = window.setInterval(usage.reload, 60_000);
    return () => window.clearInterval(timer);
  }, [usage.reload]);
  useEffect(() => setMobileOpen(false), [location.pathname]);
  function globalSubmit(event: FormEvent) {
    event.preventDefault();
    if (globalQuery.trim()) navigate(`/research?mode=global&q=${encodeURIComponent(globalQuery.trim())}`);
  }
  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Scale size={21} /></div>
          {!collapsed && <div><strong>CourtListenerDash</strong><span>Legal Intelligence</span></div>}
          <button className="icon-button desktop-only" onClick={() => setCollapsed((value) => !value)} title="Toggle navigation">
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav>
          {navGroups.map((group) => group.label === "Advanced" && !collapsed ? (
            <details className="nav-group advanced-nav" key={group.label}>
              <summary><span className="nav-label">{group.label}</span><ChevronDown size={14} /></summary>
              {group.links.map(([to, label, Icon]) => <NavLink key={to} to={to}><Icon size={18} /><span>{label}</span></NavLink>)}
            </details>
          ) : (
            <div className="nav-group" key={group.label}>
              {!collapsed && <span className="nav-label">{group.label}</span>}
              {group.links.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} title={collapsed ? label : undefined}><Icon size={18} /><span>{label}</span></NavLink>)}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="connection-mini">
            <span className={`connection-dot ${status.data?.mcp === "connected" ? "online" : "offline"}`} />
            {!collapsed && <span>{status.data?.mcp === "connected" ? "CourtListener connected" : "Setup required"}</span>}
          </div>
          <button className="nav-button" onClick={onLogout} title="Sign out"><LogOut size={18} /><span>Sign out</span></button>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <form className="global-search" onSubmit={globalSubmit}>
            <Search size={18} />
            <input
              value={globalQuery}
              onChange={(event) => setGlobalQuery(event.target.value)}
              placeholder="Search cases, dockets, judges, oral arguments…"
              aria-label="Global CourtListener search"
            />
            <kbd>Enter</kbd>
          </form>
          <UsageIndicator usage={usage.data} />
          <Link className="connection-button" to="/settings" aria-label="CourtListener connection settings">
            <span className={`connection-dot ${status.data?.mcp === "connected" ? "online" : "offline"}`} />
            <span>{status.data?.mcp === "connected" ? "Connected" : "Connect"}</span>
          </Link>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useLoad(() => api<{
    configured: boolean;
    usage: unknown;
    usageSummary: ApiUsageSummary | null;
    activity: ActivityRecord[];
    saved: SavedResearch[];
    mcp: { connected: boolean; toolCount: number; lastSuccess: string | null; lastError: string | null };
  }>("/api/dashboard"));
  const status = useLoad(() => api<ConnectionStatus & { tls: boolean }>("/api/status"));
  function beginResearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) navigate(`/research?mode=global&q=${encodeURIComponent(query.trim())}`);
  }
  if (loading) return <Loading />;
  const searches = data?.activity.filter((item) => item.category === "research") ?? [];
  const citationChecks = data?.activity.filter((item) => /citation/i.test(item.action)) ?? [];
  const legalActivity = data?.activity.filter((item) => ["research", "case", "docket", "mcp"].includes(item.category)) ?? [];
  const savedCases = data?.saved.filter((item) => /case|opinion/i.test(item.kind)).slice(0, 4) ?? [];
  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy"><span className="eyebrow">CourtListener legal research</span><h1>Find the law. Follow the record.</h1><p>Research opinions, federal dockets, filings, judicial records, and citation relationships grounded in CourtListener.</p></div>
        <form className="dashboard-search" onSubmit={beginResearch}><Search size={23} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Case name, citation, party, issue, judge, or docket number…" aria-label="Begin legal research" /><button className="primary" disabled={!query.trim()}>Search</button></form>
        <div className="research-mode-links"><span>Try:</span><button onClick={() => setQuery("warrantless historical location data")}>Fourth Amendment location data</button><Link to="/semantic"><Sparkles size={14} />Ask a natural-language question</Link></div>
      </section>
      {error && <div className="banner error"><AlertTriangle size={18} />{error}</div>}
      {!data?.configured && (
        <div className="banner setup">
          <KeyRound size={20} />
          <div><strong>CourtListener connection required</strong><span>Add the API token securely in Settings to activate all research modules.</span></div>
          <Link className="primary compact" to="/settings">Configure connection</Link>
        </div>
      )}
      <section className="insight-grid">
        <Link to="/saved" className="insight-card"><span className="insight-icon"><Bookmark size={19} /></span><div><strong>{data?.saved.length ?? 0}</strong><span>Saved authorities</span></div><ChevronRight size={18} /></Link>
        <Link to="/research" className="insight-card"><span className="insight-icon"><Clock3 size={19} /></span><div><strong>{searches.length}</strong><span>Recent searches</span></div><ChevronRight size={18} /></Link>
        <Link to="/verify" className="insight-card"><span className="insight-icon"><FileCheck2 size={19} /></span><div><strong>{citationChecks.length}</strong><span>Recent citation checks</span></div><ChevronRight size={18} /></Link>
        <Link to="/alerts" className="insight-card"><span className="insight-icon"><Bell size={19} /></span><div><strong>Monitor</strong><span>Active alerts and dockets</span></div><ChevronRight size={18} /></Link>
      </section>
      <section className="quick-grid">
        <Link to="/research" className="quick-card"><Search size={22} /><div><strong>Unified research</strong><span>Search six CourtListener collections</span></div><ChevronRight size={18} /></Link>
        <Link to="/dockets" className="quick-card"><BriefcaseBusiness size={22} /><div><strong>Federal dockets</strong><span>RECAP filings and timelines</span></div><ChevronRight size={18} /></Link>
        <Link to="/verify" className="quick-card"><FileCheck2 size={22} /><div><strong>Verify citations</strong><span>Ground citations in CourtListener</span></div><ChevronRight size={18} /></Link>
        <Link to="/alerts" className="quick-card"><Bell size={22} /><div><strong>Monitor matters</strong><span>Search and docket alerts</span></div><ChevronRight size={18} /></Link>
      </section>
      <div className="dashboard-columns">
        <section className="panel research-history">
          <div className="panel-heading"><div><span className="eyebrow">Your workspace</span><h2>Recent research</h2></div><Link className="text-button" to="/research">New search <ChevronRight size={15} /></Link></div>
          {legalActivity.length ? (
            <div className="activity-list" tabIndex={0} aria-label="Recent research activity">
              {legalActivity.map((item) => (
                <div className="activity-row" key={item.id}>
                  <span className={`activity-icon ${item.status}`}>{item.status === "success" ? <Check size={14} /> : <X size={14} />}</span>
                  <div><strong>{humanize(item.action)}</strong><span>{item.summary}</span></div>
                  <time>{formatDate(item.createdAt)}</time>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={<Clock3 />} title="No research activity yet" detail="Your searches, dockets, and citation checks will appear here." />}
        </section>
        <section className="panel recent-authorities">
          <div className="panel-heading"><div><span className="eyebrow">Research library</span><h2>Recent saved cases</h2></div><Link className="text-button" to="/saved">View all <ChevronRight size={15} /></Link></div>
          {savedCases.length ? <div className="compact-saved-list">{savedCases.map((item) => <article key={item.id}><span className="collection-badge">{item.kind}</span><h3>{item.title}</h3><p>{item.subtitle || "Saved authority"}</p><time>{formatDate(item.createdAt)}</time></article>)}</div> : <EmptyState icon={<BookOpen />} title="No cases saved yet" detail="Bookmark authorities from search results to keep them close at hand." />}
        </section>
      </div>
      <details className="system-status panel">
        <summary><span><ShieldCheck size={18} /><strong>System status</strong><small>{status.data?.mcp === "connected" ? "CourtListener connected" : "Connection needs attention"}</small></span><ChevronDown size={16} /></summary>
        <div className="system-status-grid"><div><small>CourtListener</small><StatusPill status={status.data?.mcp || "Checking"} /></div><div><small>Research API</small><StatusPill status={status.data?.api || "Unknown"} /></div><div><small>Security</small><strong>{status.data?.tls ? "HTTPS · authenticated" : "LAN authentication"}</strong></div><div><small>Last successful request</small><strong>{status.data?.lastSuccessfulRequest ? formatDate(status.data.lastSuccessfulRequest) : "No request yet"}</strong></div></div>
        {Boolean(data?.usage) && <details className="technical-details"><summary>Technical API usage response</summary><JsonBlock value={data?.usage} collapsed /></details>}
        <button className="secondary compact" onClick={() => { reload(); status.reload(); }}><RefreshCw size={15} />Refresh status</button>
      </details>
    </>
  );
}

const typeLabels: Record<string, string> = {
  o: "Case law",
  d: "Dockets",
  r: "RECAP cases",
  rd: "Documents",
  oa: "Oral arguments",
  p: "Judges",
};

const semanticIntents: Array<{ id: SemanticResearchIntent; label: string; description: string; prompt: string }> = [
  { id: "issue", label: "Legal issue", description: "Different words, same legal issue", prompt: "Find judicial opinions that address this legal issue, including opinions that use different terminology." },
  { id: "similar_facts", label: "Similar facts", description: "Comparable evidence or events", prompt: "Find judicial opinions with materially comparable facts, evidence, or events." },
  { id: "doctrine", label: "Doctrine or rule", description: "The same test or legal standard", prompt: "Find judicial opinions applying or explaining the same legal doctrine, rule, or test." },
  { id: "procedure", label: "Procedure", description: "Comparable procedural posture", prompt: "Find judicial opinions addressing the same procedural issue or procedural posture." },
  { id: "reasoning", label: "Relevant reasoning", description: "Analysis useful to an argument", prompt: "Find judicial reasoning relevant to evaluating or supporting this argument." },
  { id: "distinguish_limit", label: "Distinguish or limit", description: "Narrow, limit, or distinguish authority", prompt: "Find judicial opinions that distinguish, narrow, limit, question, or decline to extend the identified authority or proposition." },
];

type SemanticSession = {
  intent: SemanticResearchIntent;
  intentLabel: string;
  intentDescription: string;
  anchor: string;
  court: string;
  filedAfter: string;
  filedBefore: string;
};

function ResearchForm({
  initialQuery = "",
  initialType = "o",
  semantic = false,
  lockType = false,
  initialIntent = "issue",
  onResults,
}: {
  initialQuery?: string;
  initialType?: string;
  semantic?: boolean;
  lockType?: boolean;
  initialIntent?: SemanticResearchIntent;
  onResults: (value: unknown, query: string, type: string, semanticSession?: SemanticSession) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [citation, setCitation] = useState("");
  const [type, setType] = useState(initialType);
  const [court, setCourt] = useState("");
  const [filedAfter, setFiledAfter] = useState("");
  const [filedBefore, setFiledBefore] = useState("");
  const [intent, setIntent] = useState<SemanticResearchIntent>(initialIntent);
  const [anchor, setAnchor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const courtChoices = useLoad(() => api<ToolResult>("/api/choices/search/court"));
  const choiceData = asObject(courtChoices.data?.data);
  const courts = Array.isArray(choiceData.choices) ? records(choiceData.choices) : [];
  const previousInitial = useRef(initialQuery);
  useEffect(() => {
    if (initialQuery && initialQuery !== previousInitial.current) setQuery(initialQuery);
    previousInitial.current = initialQuery;
  }, [initialQuery]);
  useEffect(() => setIntent(initialIntent), [initialIntent]);
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const inferredCitation = !semantic && type === "o" && looksLikeReporterCitation(query) ? query.trim() : "";
    const exactCitation = citation.trim() || inferredCitation;
    const keywordQuery = inferredCitation && !citation.trim() ? "" : query.trim();
    if (!keywordQuery && !exactCitation) return;
    setBusy(true);
    setError("");
    try {
      const intentDefinition = semanticIntents.find((item) => item.id === intent) ?? semanticIntents[0];
      const groundedQuery = semantic
        ? `${intentDefinition.prompt}\nResearch question: ${query.trim()}${anchor.trim() ? `\nAuthority or proposition to evaluate: ${anchor.trim()}` : ""}`
        : keywordQuery;
      const response = await post<ToolResult>("/api/search", {
        query: groundedQuery,
        type: semantic ? "o" : type,
        semantic,
        court,
        filedAfter,
        filedBefore,
        citation: exactCitation,
        numResults: 20,
      });
      onResults(response.data, query.trim() || exactCitation, semantic ? "o" : type, semantic ? {
        intent,
        intentLabel: intentDefinition.label,
        intentDescription: intentDefinition.description,
        anchor: anchor.trim(),
        court,
        filedAfter,
        filedBefore,
      } : undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="research-form" onSubmit={submit}>
      {semantic && <div className="semantic-purpose">
        <div className="semantic-purpose-heading"><Target size={18} /><div><strong>What should this research accomplish?</strong><span>The objective stays attached to this research session and shapes CourtListener's semantic query.</span></div></div>
        <div className="intent-grid">{semanticIntents.map((item) => <button type="button" key={item.id} className={intent === item.id ? "active" : ""} onClick={() => setIntent(item.id)}><strong>{item.label}</strong><span>{item.description}</span></button>)}</div>
        {intent === "distinguish_limit" && <label className="anchor-field">Authority or proposition to distinguish<input value={anchor} onChange={(event) => setAnchor(event.target.value)} placeholder="e.g., Carpenter v. United States, 585 U.S. 296" /></label>}
      </div>}
      <div className="research-input-row">
        {semantic ? <Sparkles size={21} /> : <Search size={21} />}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={semantic ? "Describe the legal issue in natural language…" : "Enter names, issues, citations, parties, or docket terms…"}
        />
        <button className="primary" disabled={busy || (!query.trim() && !(type === "o" && citation.trim()))}>
          {busy ? <LoaderCircle className="spin" size={17} /> : semantic ? <Sparkles size={17} /> : <Search size={17} />}
          {semantic ? "Run semantic search" : "Search"}
        </button>
      </div>
      <div className="filter-row">
        {!semantic && !lockType && (
          <label>Collection<select value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        )}
        {!semantic && lockType && <div className="fixed-collection"><small>Collection</small><strong>{typeLabels[type] || "CourtListener records"}</strong></div>}
        {!semantic && type === "o" && <label>Exact citation<input value={citation} onChange={(event) => setCitation(event.target.value)} placeholder="For example, 347 U.S. 483" /></label>}
        <label>Court / jurisdiction<select value={court} onChange={(event) => setCourt(event.target.value)} disabled={courtChoices.loading || Boolean(courtChoices.error)}><option value="">All available courts</option>{courts.map((choice, index) => <option value={first(choice.value)} key={first(choice.value, index)}>{first(choice.display_name, choice.value)} ({first(choice.value)})</option>)}</select>{courtChoices.error && <small className="field-note">Court filter unavailable; searching all courts.</small>}</label>
        {(semantic || ["o", "r", "rd", "d", "oa"].includes(type)) && <label>{type === "oa" ? "Argued after" : "Filed after"}<input type="date" value={filedAfter} onChange={(event) => setFiledAfter(event.target.value)} /></label>}
        {(semantic || ["o", "r", "rd", "d", "oa"].includes(type)) && <label>{type === "oa" ? "Argued before" : "Filed before"}<input type="date" value={filedBefore} onChange={(event) => setFiledBefore(event.target.value)} /></label>}
      </div>
      {error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}
    </form>
  );
}

function ResultCard({ item, type, query, semanticSession, onSave }: { item: JsonObject; type: string; query: string; semanticSession?: SemanticSession; onSave?: () => void }) {
  const title = first(item.caseNameFull, item.caseName, item.case_name_full, item.case_name, item.name_full, item.name, item.description, item.docketNumber, item.docket_number, "CourtListener result");
  const courtObject = asObject(item.court);
  const court = courtDisplay(item.court_citation_string, courtObject, item.court_name, item.jurisdiction, item.court_id, item.court);
  const date = first(item.dateFiled, item.date_filed, item.dateArgued, item.date_created, item.date_modified);
  const citation = formatCitations(item.citation ?? item.citations ?? item.neutralCite ?? item.neutral_cite ?? item.lexisCite);
  const snippet = stripMarkup(item.snippet ?? item.syllabus ?? item.text ?? item.short_description ?? item.description);
  const docketNumber = first(item.docketNumber, item.docket_number);
  const judge = first(item.judge, item.panel_names, item.judges, item.author_str);
  const opinionType = first(item.status, item.type_name, item.type, item.precedential_status);
  const posture = first(item.posture, item.procedural_history, item.suitNature, item.suit_nature);
  const url = absoluteCourtListenerUrl(item.absolute_url ?? item.resource_uri ?? item.download_url);
  const clusterId = idFrom(item.cluster_id ?? item.cluster);
  const docketId = idFrom(item.docket_id ?? item.docket ?? (type === "d" || type === "r" ? item.id : null));
  const personId = idFrom(item.person_id ?? item.person ?? (type === "p" ? item.id : null));
  const recapDocumentId = type === "rd" ? idFrom(item.id) : null;
  let internal: string | null = null;
  if (type === "o" && clusterId) internal = `/cases/${clusterId}`;
  if (["d", "r"].includes(type) && docketId) internal = `/dockets/${docketId}`;
  if (type === "p" && personId) internal = `/judges/${personId}`;
  if (type === "oa" && idFrom(item.id)) internal = `/oral-arguments/${idFrom(item.id)}`;
  if (recapDocumentId) internal = `/documents/recap/${recapDocumentId}`;
  return (
    <article className="result-card">
      <div className="result-topline">
        <div><span className="collection-badge">{typeLabels[type] || "Record"}</span>{opinionType && <span className="opinion-type-badge">{humanize(opinionType)}</span>}</div>
        {date && <time>{formatDate(date)}</time>}
      </div>
      <h3>{internal ? <Link to={internal}><HighlightText text={title} query={query} /></Link> : <HighlightText text={title} query={query} />}</h3>
      {citation && <div className="primary-citation">{citation}</div>}
      <div className="metadata-line">
        {court && <span><Landmark size={14} />{court}</span>}
        {docketNumber && <span><BriefcaseBusiness size={14} />No. {docketNumber}</span>}
        {judge && <span><Gavel size={14} />{judge}</span>}
      </div>
      {semanticSession && <div className="semantic-relevance"><Sparkles size={15} /><div><strong>Why this authority is in the result set</strong><span>CourtListener ranked it as conceptually relevant to your <em>{semanticSession.intentLabel.toLowerCase()}</em> objective. The source passage below comes from the CourtListener opinion index and is not AI-generated.</span></div></div>}
      {posture && <p className="result-context"><strong>Context:</strong> {posture.slice(0, 360)}</p>}
      {snippet && <div className={`snippet ${semanticSession ? "matched-passage" : ""}`}>{semanticSession && <strong><Quote size={14} />Matched opinion passage</strong>}<p><HighlightText text={snippet.slice(0, 900)} query={query} /></p></div>}
      {type === "oa" && <div className="audio-availability"><AudioLines size={15} /><span>Open the oral-argument record to load its secure CourtListener stream and transcript.</span></div>}
      <footer>
        <div>
          {internal && <Link className="text-button" to={internal}>Open workspace <ChevronRight size={15} /></Link>}
          {url && <a className="text-button" href={url} target="_blank" rel="noreferrer">CourtListener <ExternalLink size={14} /></a>}
        </div>
        {onSave && <button className="icon-button" title="Save research" onClick={onSave}><Bookmark size={16} /></button>}
      </footer>
      <details className="technical-details result-technical"><summary>Technical details</summary><dl><div><dt>CourtListener record</dt><dd>{first(item.id, "—")}</dd></div><div><dt>Cluster</dt><dd>{first(item.cluster_id, item.cluster, "—")}</dd></div><div><dt>Opinion</dt><dd>{first(item.opinion_id, "—")}</dd></div></dl></details>
    </article>
  );
}

function SearchResults({ data, type, query, semanticSession }: { data: unknown; type: string; query: string; semanticSession?: SemanticSession }) {
  const notify = useNotice();
  const object = asObject(data);
  const [items, setItems] = useState(() => records(data));
  const [queryId, setQueryId] = useState(() => first(object.query_id));
  const [hasMore, setHasMore] = useState(() => object.has_more === true || (Number(object.count) > records(data).length));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  useEffect(() => {
    const nextObject = asObject(data);
    const nextItems = records(data);
    setItems(nextItems);
    setQueryId(first(nextObject.query_id));
    setHasMore(nextObject.has_more === true || Number(nextObject.count) > nextItems.length);
    setMoreError("");
  }, [data]);
  async function loadMore() {
    if (!queryId || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const response = await post<ToolResult>("/api/search/more", { queryId, numResults: 20 });
      const page = asObject(response.data);
      const nextItems = records(response.data);
      setItems((current) => [...current, ...nextItems]);
      setQueryId(first(page.query_id, queryId));
      setHasMore(nextItems.length > 0 && page.has_more !== false);
    } catch (reason) {
      setMoreError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingMore(false);
    }
  }
  async function save(item: JsonObject) {
    const title = first(item.caseName, item.case_name, item.name_full, item.name, item.description, "CourtListener result");
    try {
      await post("/api/saved", {
        kind: typeLabels[type] || "CourtListener record",
        title,
        subtitle: query,
        courtlistenerUrl: absoluteCourtListenerUrl(item.absolute_url ?? item.resource_uri),
        payload: { ...item, researchQuestion: query, semanticSession },
      });
      notify({ kind: "success", message: `Saved “${title}”` });
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  async function saveSearch() {
    try {
      await post("/api/saved", { kind: semanticSession ? "Semantic research" : "Saved search", title: query, subtitle: semanticSession ? `${semanticSession.intentLabel} · ${semanticSession.court || "All courts"}` : typeLabels[type] || "CourtListener search", courtlistenerUrl: null, payload: { query, type, semanticSession } });
      notify({ kind: "success", message: `Saved search “${query}”` });
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  return (
    <section className="results-section">
      {semanticSession && <div className="research-intent-strip"><div><span className="eyebrow">Research question</span><strong>{query}</strong></div><ChevronRight size={18} /><div><span className="eyebrow">Search intent</span><strong>{semanticSession.intentLabel}</strong><small>{semanticSession.intentDescription}</small></div><ChevronRight size={18} /><div><span className="eyebrow">Grounding</span><strong>CourtListener opinions only</strong><small>{semanticSession.court ? `Court: ${semanticSession.court}` : "All available courts"}</small></div></div>}
      <div className="results-heading">
        <div><span className="eyebrow">CourtListener authorities</span><h2>{first(object.count, items.length)} results for “{query}”</h2><p>{semanticSession ? "Ranked by CourtListener semantic relevance. Open the full authority before relying on a matched passage." : "Review the court, date, citation, and excerpt before opening the full record."}</p></div>
        <div className="results-actions"><button className="secondary compact" onClick={() => void saveSearch()}><Bookmark size={15} />Save search</button>{first(object.query_id) && <details className="technical-details"><summary>Search details</summary><code>Query {first(object.query_id)}</code></details>}</div>
      </div>
      {items.length ? <div className="result-list">{items.map((item, index) => <ResultCard key={`${first(item.id, item.cluster_id, "result")}-${index}`} item={item} type={type} query={query} semanticSession={semanticSession} onSave={() => void save(item)} />)}</div> : <EmptyState icon={<FileSearch />} title="No results located" detail="CourtListener returned no matching records for these filters. This does not establish that no authority exists." />}
      {moreError && <div className="banner error"><AlertTriangle size={17} />{moreError}</div>}
      {items.length > 0 && hasMore && queryId && <div className="load-more"><button className="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <LoaderCircle className="spin" size={16} /> : <ChevronDown size={16} />}Load more CourtListener results</button><span>{items.length} shown{Number(object.count) > 0 ? ` of ${Number(object.count).toLocaleString()}` : ""}</span></div>}
    </section>
  );
}

function ResearchPage() {
  const [params] = useSearchParams();
  const [single, setSingle] = useState<{ data: unknown; query: string; type: string } | null>(null);
  const [unified, setUnified] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [unifiedError, setUnifiedError] = useState("");
  const query = params.get("q") || "";
  const globalMode = params.get("mode") === "global";
  const lastAutomaticQuery = useRef("");
  async function runUnified(value: string) {
    setBusy(true);
    setUnifiedError("");
    setUnified(null);
    try {
      const response = await post<{ query: string; results: Record<string, unknown> }>("/api/search/unified", { query: value, numResults: 8 });
      setUnified(response.results);
    } catch (reason) {
      setUnifiedError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!globalMode || !query || lastAutomaticQuery.current === query) return;
    lastAutomaticQuery.current = query;
    void runUnified(query);
  }, [globalMode, query]);
  return (
    <>
      <PageHeader eyebrow="Legal research" title="Search CourtListener" description="Use a focused collection search when you know what kind of record you need. Global Search checks every supported collection and keeps each result type in a separate tab." />
      <ResearchForm initialQuery={query} onResults={(data, value, type) => { setSingle({ data, query: value, type }); setUnified(null); }} />
      <div className="unified-strip">
        <div><Network size={19} /><span><strong>Global Search</strong>Use the same words across opinions, federal dockets, RECAP filings, documents, oral arguments, and judges.</span></div>
        <button className="secondary" disabled={busy || !(single?.query || query)} onClick={() => void runUnified(single?.query || query)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Network size={16} />}Search all collections</button>
      </div>
      {unifiedError && <div className="banner error"><AlertTriangle size={17} />{unifiedError}<button className="secondary compact" onClick={() => void runUnified(single?.query || query)}><RefreshCw size={14} />Try again</button></div>}
      {single && <SearchResults {...single} />}
      {unified && <UnifiedResults results={unified} query={single?.query || query} />}
      {!single && !unified && <EmptyState icon={<Search />} title="Begin with a legal question or record" detail="Results remain separated by source type so opinions, dockets, filings, and people never collapse into an unreadable list." />}
    </>
  );
}

function UnifiedResults({ results, query }: { results: Record<string, unknown>; query: string }) {
  const [active, setActive] = useState(Object.keys(results)[0] || "o");
  return (
    <section className="results-section">
      <div className="tab-row">
        {Object.keys(results).map((type) => {
          const value = asObject(results[type]);
          const count = records(value).length;
          const failed = "error" in value;
          return <button className={active === type ? "active" : ""} onClick={() => setActive(type)} key={type}>{typeLabels[type] || type}<span>{failed ? "!" : count}</span></button>;
        })}
      </div>
      {"error" in asObject(results[active]) ? <div className="banner error"><AlertTriangle size={17} />{first(asObject(results[active]).error)}</div> : <SearchResults data={results[active]} type={active} query={query} />}
    </section>
  );
}

function SemanticSearchPage() {
  const [params] = useSearchParams();
  const requestedIntent = params.get("intent") as SemanticResearchIntent | null;
  const initialIntent = semanticIntents.some((item) => item.id === requestedIntent) ? requestedIntent! : "issue";
  const [result, setResult] = useState<{ data: unknown; query: string; type: string; semanticSession: SemanticSession } | null>(null);
  return <>
    <PageHeader eyebrow="Natural-language research" title="Research by legal meaning" description="State the legal problem and the result you need. CourtListener finds conceptually related opinions; CourtListenerDash keeps your purpose, matched source passages, and authorities together." />
    <div className="semantic-workflow"><span><strong>1</strong> Research question</span><ChevronRight size={16} /><span><strong>2</strong> Legal intent</span><ChevronRight size={16} /><span><strong>3</strong> CourtListener authorities</span><ChevronRight size={16} /><span><strong>4</strong> Grounded case analysis</span></div>
    <ResearchForm initialQuery={params.get("q") || ""} initialType="o" semantic initialIntent={initialIntent} onResults={(data, query, type, semanticSession) => semanticSession && setResult({ data, query, type, semanticSession })} />
    {result ? <SearchResults {...result} /> : <div className="semantic-start-grid"><EmptyState icon={<Target />} title="Begin with the research outcome" detail="Choose whether you need the same issue, similar facts, a doctrine, procedural authority, useful reasoning, or decisions that limit an authority." /><aside className="semantic-guidance"><span className="eyebrow">Good research questions carry context</span><h3>Describe facts, doctrine, court, and the decision you need.</h3><Link to="/semantic?q=Colorado%20federal%20cases%20discussing%20authentication%20of%20AI-generated%20evidence">Colorado federal cases discussing authentication of AI-generated evidence</Link><Link to="/semantic?q=Decisions%20distinguishing%20Carpenter%20where%20location%20records%20covered%20a%20short%20period&intent=distinguish_limit">Decisions distinguishing Carpenter where location records covered a short period</Link><Link to="/semantic?q=Appellate%20opinions%20applying%20abuse-of-discretion%20review%20to%20excluded%20digital%20evidence&intent=procedure">Appellate opinions applying abuse-of-discretion review to excluded digital evidence</Link><p>Search results are authorities located by CourtListener. The application never asks an AI model to supply case names or citations.</p></aside></div>}
  </>;
}

function FocusedSearchPage({ mode }: { mode: "cases" | "dockets" | "oral" | "judges" }) {
  const settings = {
    cases: ["Case law archive", "Cases & Opinions", "Search federal and state opinions, citations, courts, judges, and decision dates.", "o", BookOpen],
    dockets: ["Federal litigation", "PACER / RECAP", "Find federal cases and open a structured workspace for parties, attorneys, docket activity, and publicly available RECAP filings. Direct PACER purchasing is not performed.", "r", BriefcaseBusiness],
    oral: ["Audio archive", "Oral Arguments", "Search argument recordings and associated case metadata, with audio playback when CourtListener provides a stream.", "oa", AudioLines],
    judges: ["Judiciary research", "Judges", "Search judicial biographies, appointments, positions, professional history, and connected disclosure records.", "p", Gavel],
  }[mode] as [string, string, string, string, typeof Search];
  const [result, setResult] = useState<{ data: unknown; query: string; type: string } | null>(null);
  const Icon = settings[4];
  return (
    <>
      <PageHeader eyebrow={settings[0]} title={settings[1]} description={settings[2]} />
      <ResearchForm initialType={settings[3]} lockType onResults={(data, query, type) => setResult({ data, query, type })} />
      {result ? <SearchResults {...result} /> : <EmptyState icon={<Icon />} title={`Search ${settings[1].toLowerCase()}`} detail="Use filters supported by CourtListener; unsupported filters are not fabricated locally." />}
    </>
  );
}

function SectionTabs({ tabs, active, onChange }: { tabs: Array<[string, string, number?]>; active: string; onChange: (value: string) => void }) {
  return <div className="tab-row workspace-tabs">{tabs.map(([id, label, count]) => <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}>{label}{count !== undefined && <span>{count}</span>}</button>)}</div>;
}

function RecordTable({ data, empty = "No records returned." }: { data: unknown; empty?: string }) {
  const upstreamError = returnedError(data);
  if (upstreamError) return <EmptyState icon={<AlertTriangle />} title="CourtListener data unavailable" detail={upstreamError} />;
  const rows = records(data);
  if (!rows.length) return <EmptyState icon={<Database />} title="No records available" detail={empty} />;
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !/text|html|plain/i.test(key)).slice(0, 7);
  return (
    <div className="table-wrap"><table><thead><tr>{keys.map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={first(row.id, index)}>{keys.map((key) => <td key={key}>{typeof row[key] === "object" ? JSON.stringify(row[key]).slice(0, 160) : first(row[key]).slice(0, 200) || "—"}</td>)}</tr>)}</tbody></table></div>
  );
}

function SourceLinks({ sources, onLocate }: { sources: SourcePassage[]; onLocate: (source: SourcePassage) => void }) {
  return <div className="source-links">{sources.map((source) => <details key={source.paragraph}><summary><BadgeCheck size={13} />{source.paragraph} verified</summary><div><blockquote>{source.excerpt}</blockquote><button className="text-button" type="button" onClick={() => onLocate(source)}>Locate in full opinion <ChevronRight size={13} /></button></div></details>)}</div>;
}

function AnalysisClaim({ title, claim, prominent = false, onLocate }: { title: string; claim: GroundedClaim | null; prominent?: boolean; onLocate: (source: SourcePassage) => void }) {
  if (!claim) return null;
  return <article className={`analysis-claim ${prominent ? "prominent" : ""}`}><span>{title}</span><p>{claim.text}</p><SourceLinks sources={claim.sources} onLocate={onLocate} /></article>;
}

function AnalysisClaimList({ title, claims, onLocate }: { title: string; claims: GroundedClaim[]; onLocate: (source: SourcePassage) => void }) {
  if (!claims.length) return null;
  return <section className="analysis-list"><h3>{title}</h3>{claims.map((claim, index) => <article key={`${title}-${index}`}><p>{claim.text}</p><SourceLinks sources={claim.sources} onLocate={onLocate} /></article>)}</section>;
}

function CaseQuestionPanel({ state, opinionId, clusterId, caseTitle, onLocate, onNavigate }: { state: CaseAnalysisState; opinionId: number; clusterId: string; caseTitle: string; onLocate: (source: SourcePassage) => void; onNavigate: (tab: string) => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const analysis = state.analysis;
  function localAnswer(label: string, claim: GroundedClaim | null | undefined) {
    if (!claim || !analysis) return;
    setQuestion(label);
    setError("");
    setAnswer({ answer: claim, caveats: [], provider: analysis.provider, model: analysis.model, generatedAt: analysis.generatedAt });
  }
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    try {
      setAnswer(await post<GroundedAnswer>(`/api/cases/${clusterId}/ask`, { opinionId, question }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  const relatedQuestion = analysis?.materialFacts.map((item) => item.text).join(" ").slice(0, 800) || caseTitle;
  return <aside className="case-question-panel">
    <div className="case-question-heading"><MessageSquare size={18} /><div><span className="eyebrow">Grounded case questions</span><h3>Ask this opinion</h3></div></div>
    <div className="question-shortcuts">
      <button type="button" disabled={!analysis?.holding} onClick={() => localAnswer("What is the holding?", analysis?.holding)}>What is the holding?</button>
      <button type="button" disabled={!analysis?.reasoning.length} onClick={() => localAnswer("Why did the court rule this way?", analysis?.reasoning[0])}>Why did the court rule this way?</button>
      <button type="button" disabled={!analysis?.materialFacts.length} onClick={() => localAnswer("What facts were decisive?", analysis?.materialFacts[0])}>What facts were decisive?</button>
      <button type="button" disabled={!analysis?.proceduralPosture} onClick={() => localAnswer("What procedural issue controlled?", analysis?.proceduralPosture)}>What procedural issue controlled?</button>
      <button type="button" onClick={() => onNavigate("citing")}>What cases later cited it? <ChevronRight size={13} /></button>
      <Link to={`/semantic?intent=similar_facts&q=${encodeURIComponent(`Find cases with facts similar to ${caseTitle}: ${relatedQuestion}`)}`}>Find cases with similar facts <ChevronRight size={13} /></Link>
    </div>
    <form onSubmit={ask}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the standard of review, a decisive fact, a dissent, or how the court reasoned…" rows={3} /><button className="primary compact" disabled={busy || !question.trim()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}Answer from opinion</button></form>
    {error && <div className="inline-error"><AlertTriangle size={15} />{error}</div>}
    {answer && <div className="grounded-answer"><span className="eyebrow">Answer grounded in the selected opinion</span>{answer.answer ? <><p>{answer.answer.text}</p><SourceLinks sources={answer.answer.sources} onLocate={onLocate} /></> : <p>No source-supported answer was returned.</p>}{answer.caveats.map((caveat, index) => <small key={index}>{caveat}</small>)}<footer>{humanize(answer.provider)} · {answer.model} · attorney verification required</footer></div>}
  </aside>;
}

function CaseAnalysisPanel({ clusterId, opinionId, caseTitle, onLocate, onNavigate }: { clusterId: string; opinionId: number | null; caseTitle: string; onLocate: (source: SourcePassage) => void; onNavigate: (tab: string) => void }) {
  const notify = useNotice();
  const state = useLoad<CaseAnalysisState>(() => opinionId ? api<CaseAnalysisState>(`/api/cases/${clusterId}/analysis?opinionId=${opinionId}`) : Promise.resolve({ status: "not_started", progress: 0, stage: "No opinion", error: null, updatedAt: null, analysis: null, ai: { configured: false, available: false, provider: null, model: null, baseUrl: null, lastCheckedAt: null, lastError: null } }), [clusterId, opinionId]);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!state.data || !["queued", "running"].includes(state.data.status)) return;
    const timer = window.setInterval(state.reload, 2_500);
    return () => window.clearInterval(timer);
  }, [state.data?.status, state.reload]);
  async function start(regenerate = false) {
    if (!opinionId) return;
    setStarting(true);
    try {
      await post(`/api/cases/${clusterId}/analysis`, { opinionId, regenerate });
      state.reload();
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      setStarting(false);
    }
  }
  if (!opinionId) return <section className="case-analysis-shell"><EmptyState icon={<Sparkles />} title="Case analysis unavailable" detail="CourtListener did not provide a primary opinion record to analyze." /></section>;
  if (state.loading) return <section className="case-analysis-shell"><Loading label="Checking for grounded case analysis…" /></section>;
  if (state.error || !state.data) return <div className="banner error"><AlertTriangle size={16} />{state.error || "Analysis state unavailable"}</div>;
  const value = state.data;
  const analysis = value.analysis;
  return <section className="case-analysis-shell">
    <header className="analysis-header"><div><span className="eyebrow"><Sparkles size={13} />AI-assisted · CourtListener-grounded</span><h2>Case analysis</h2><p>The model analyzes the complete retrieved opinion in sections. Displayed conclusions must carry a verified source passage.</p></div>{analysis && <button className="secondary compact" disabled={starting || value.status === "running"} onClick={() => void start(true)}><RefreshCw size={14} />Regenerate</button>}</header>
    {!value.ai.configured && <div className="analysis-setup"><div><KeyRound size={21} /><span><strong>Connect an approved AI provider</strong><small>CourtListener retrieval is active. AI analysis stays disabled until a backend provider is configured.</small></span></div><Link className="primary compact" to="/settings#legal-ai">Configure AI</Link></div>}
    {value.ai.configured && !analysis && !["queued", "running"].includes(value.status) && <div className="analysis-start"><div><ListChecks size={24} /><span><strong>Build a source-linked case brief</strong><small>Reviews every section of the opinion, then validates paragraph references before displaying the holding, rule, facts, reasoning, and disposition.</small></span></div>{value.error && <div className="inline-error"><AlertTriangle size={15} />{value.error}</div>}<button className="primary" disabled={starting} onClick={() => void start()}>{starting ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}Analyze complete opinion</button></div>}
    {["queued", "running"].includes(value.status) && <div className="analysis-progress"><div><LoaderCircle className="spin" size={20} /><span><strong>{value.stage}</strong><small>{value.progress}% · the complete document is processed section by section</small></span></div><div><i style={{ width: `${value.progress}%` }} /></div></div>}
    {analysis && <>
      <div className="analysis-verification"><CircleCheckBig size={17} /><span><strong>Complete-opinion review</strong>{analysis.coverage.totalParagraphs.toLocaleString()} source paragraphs · {analysis.coverage.sectionsAnalyzed} analysis sections · every displayed passage verified against CourtListener text</span></div>
      <div className="analysis-priority-grid">
        <AnalysisClaim title="Holding" claim={analysis.holding} prominent onLocate={onLocate} />
        <AnalysisClaim title="Rule of law" claim={analysis.ruleOfLaw} prominent onLocate={onLocate} />
        <AnalysisClaim title="Why the court reached this result" claim={analysis.reasoning[0] ?? null} onLocate={onLocate} />
        <AnalysisClaim title="Key material fact" claim={analysis.materialFacts[0] ?? null} onLocate={onLocate} />
        <AnalysisClaim title="Disposition" claim={analysis.disposition} onLocate={onLocate} />
        <AnalysisClaim title="Procedural posture" claim={analysis.proceduralPosture} onLocate={onLocate} />
      </div>
      <div className="analysis-depth-grid"><div>
        <AnalysisClaim title="Case overview" claim={analysis.overview} onLocate={onLocate} />
        <AnalysisClaimList title="Material facts" claims={analysis.materialFacts.slice(1)} onLocate={onLocate} />
        <AnalysisClaimList title="Legal issues and questions" claims={[...analysis.legalIssues, ...analysis.questionsPresented]} onLocate={onLocate} />
        <AnalysisClaimList title="Court's reasoning" claims={analysis.reasoning.slice(1)} onLocate={onLocate} />
        <AnalysisClaimList title="Limitations and distinguishing facts" claims={[...analysis.factualDistinctions, ...analysis.limitations]} onLocate={onLocate} />
        <AnalysisClaimList title="Concurring or dissenting opinions" claims={analysis.separateOpinions} onLocate={onLocate} />
        <AnalysisClaim title="Practical significance" claim={analysis.practicalSignificance} onLocate={onLocate} />
        {analysis.keyAuthorities.length > 0 && <section className="analysis-list"><h3>Key authorities relied upon</h3>{analysis.keyAuthorities.map((authority, index) => <article key={`${authority.citation}-${index}`}><strong className="authority-cite">{authority.citation}</strong><p>{authority.text}</p><SourceLinks sources={authority.sources} onLocate={onLocate} /></article>)}</section>}
      </div><CaseQuestionPanel state={value} opinionId={opinionId} clusterId={clusterId} caseTitle={caseTitle} onLocate={onLocate} onNavigate={onNavigate} /></div>
      <footer className="analysis-disclaimer"><ShieldCheck size={15} />{analysis.verificationNotice} Generated {formatDate(analysis.generatedAt)} with {humanize(analysis.provider)} · {analysis.model}.</footer>
    </>}
  </section>;
}

function CaseWorkspace() {
  const { clusterId = "" } = useParams();
  const { data, error, loading, reload } = useLoad(() => api<JsonObject>(`/api/cases/${clusterId}/workspace`), [clusterId]);
  const { data: courtChoiceResult } = useLoad(() => cachedApi<ToolResult>("/api/choices/search/court"));
  const [tab, setTab] = useState("overview");
  const [selectedOpinionId, setSelectedOpinionId] = useState<number | null>(null);
  const [opinionFocus, setOpinionFocus] = useState("");
  const notify = useNotice();
  if (loading) return <Loading label="Building the consolidated case workspace…" />;
  if (error || !data) return <EmptyState icon={<AlertTriangle />} title="Case workspace unavailable" detail={error || "No case data returned."} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  const cluster = asObject(data.cluster);
  const docket = asObject(data.docket);
  const opinions = records(data.opinions);
  const title = first(cluster.case_name_full, cluster.case_name, cluster.caseNameFull, cluster.caseName, cluster.slug, `CourtListener case ${clusterId}`);
  const citation = formatCitations(cluster.citations ?? cluster.citation ?? cluster.neutral_cite);
  const courtObject = asObject(cluster.court);
  const docketCourt = asObject(docket.court);
  const courtCode = first(docket.court_id, cluster.court_id, docket.court, cluster.court);
  const courtChoices = records(asObject(courtChoiceResult?.data).choices);
  const courtChoice = courtChoices.find((choice) => first(choice.value) === courtCode);
  const court = first(courtObject.full_name, courtObject.short_name, cluster.court_name, cluster.court_citation_string, docketCourt.full_name, docketCourt.short_name, docket.court_name, courtChoice?.display_name, courtCode);
  const docketNumber = first(cluster.docket_number, docket.docket_number);
  const judges = first(cluster.judges, cluster.panel_names, cluster.judge, docket.assigned_to_str, opinions[0]?.author_str);
  const status = first(cluster.precedential_status, cluster.status, opinions[0]?.type_name, opinions[0]?.type);
  const decisionDate = first(cluster.date_filed, cluster.dateFiled);
  const mainOpinionId = idFrom(data.mainOpinionId) ?? idFrom(opinions[0]?.id);
  const docketId = idFrom(data.docketId);
  const activeOpinionId = selectedOpinionId ?? mainOpinionId;
  const activeOpinion = opinions.find((opinion) => idFrom(opinion.id) === activeOpinionId) ?? opinions[0] ?? {};
  const originalPdf = safeDocumentUrl(activeOpinion.download_url ?? activeOpinion.local_path);
  const sourceUrl = safeDocumentUrl(cluster.absolute_url);
  const tabs: Array<[string, string, number?]> = [
    ["overview", "Overview"], ["opinion", "Opinion", opinions.length], ["citations", "Citation Map"],
    ["citing", "Citing Cases"], ["authorities", "Authorities Cited"], ["docket", "Docket"],
    ["documents", "Documents"], ["parties", "Parties"], ["attorneys", "Attorneys"],
    ["related", "Related Opinions", opinions.length], ["oral", "Oral Arguments"], ["raw", "Technical Details"],
  ];
  async function saveCase() {
    try {
      await post("/api/saved", { kind: "Case", title, subtitle: [citation, court, formatDate(decisionDate)].filter(Boolean).join(" · "), courtlistenerUrl: sourceUrl, payload: { clusterId, title, citation, court, decisionDate, docketNumber } });
      notify({ kind: "success", message: `Saved “${title}”` });
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  async function copyCitation() {
    const value = [title, citation, court && `(${court} ${new Date(decisionDate).getFullYear() || ""})`].filter(Boolean).join(", ");
    try {
      await navigator.clipboard.writeText(value);
      notify({ kind: "success", message: "Citation copied" });
    } catch {
      notify({ kind: "error", message: "The browser could not copy the citation. Select and copy the citation shown above instead." });
    }
  }
  function printOpinion() {
    setTab("opinion");
    window.setTimeout(() => window.print(), 250);
  }
  function locateSource(source: SourcePassage) {
    setOpinionFocus(source.excerpt.slice(0, 180));
    setTab("opinion");
  }
  return (
    <article className="case-workspace">
      <header className="case-hero">
        <div className="case-breadcrumb"><Link to="/cases">Cases & Opinions</Link><ChevronRight size={14} /><span>Case workspace</span></div>
        <div className="case-heading"><div><span className="eyebrow">Judicial decision</span><h1>{title}</h1>{citation && <p className="case-citation">{citation}</p>}</div>{status && <span className="case-status">{humanize(status)}</span>}</div>
        <dl className="case-facts">
          <div><dt><Landmark size={15} />Court</dt><dd>{court || "Not supplied"}</dd></div>
          <div><dt><CalendarDays size={15} />Decision date</dt><dd>{formatDate(decisionDate)}</dd></div>
          <div><dt><BriefcaseBusiness size={15} />Docket number</dt><dd>{docketNumber || "Not supplied"}</dd></div>
          <div><dt><Gavel size={15} />Judge / panel</dt><dd>{judges || "Not supplied"}</dd></div>
        </dl>
      </header>
      <div className="case-toolbar" role="toolbar" aria-label="Case actions">
        <button className="secondary compact" onClick={() => void saveCase()}><Bookmark size={15} />Save</button>
        {originalPdf ? <a className="secondary compact" href={originalPdf} target="_blank" rel="noreferrer"><Download size={15} />Original PDF</a> : <button className="secondary compact" onClick={printOpinion}><Download size={15} />Save as PDF</button>}
        <button className="secondary compact" onClick={printOpinion}><Printer size={15} />Print</button>
        <button className="secondary compact" disabled={!citation} onClick={() => void copyCitation()}><Copy size={15} />Copy citation</button>
        {mainOpinionId && <button className="secondary compact" onClick={() => setTab("citations")}><GitFork size={15} />Citation map</button>}
        {docketId ? <Link className="secondary compact" to={`/dockets/${docketId}`}><BriefcaseBusiness size={15} />Full docket</Link> : null}
        <button className="secondary compact" onClick={() => setTab("related")}><Network size={15} />Related opinions</button>
        {sourceUrl && <a className="text-button toolbar-source" href={sourceUrl} target="_blank" rel="noreferrer">View source <ExternalLink size={14} /></a>}
      </div>
      <SectionTabs tabs={tabs} active={tab} onChange={setTab} />
      <section className="workspace-panel">
        {tab === "overview" && <CaseOverview clusterId={clusterId} mainOpinionId={mainOpinionId} caseTitle={title} cluster={cluster} docket={docket} opinions={opinions} onLocate={locateSource} onNavigate={setTab} />}
        {tab === "opinion" && <div className="opinion-workspace">{opinions.length > 1 && <div className="opinion-selector"><span>Opinion</span>{opinions.map((opinion, index) => { const id = idFrom(opinion.id); return <button className={id === activeOpinionId ? "active" : ""} key={first(id, index)} onClick={() => id && setSelectedOpinionId(id)}>{opinionTypeLabel(opinion)}{first(opinion.author_str, opinion.author) && <small>{first(opinion.author_str, opinion.author)}</small>}</button>; })}</div>}{activeOpinionId ? <OpinionReader opinionId={activeOpinionId} opinion={activeOpinion} caseTitle={title} citation={citation} court={court} decisionDate={decisionDate} initialQuery={opinionFocus} /> : <EmptyState icon={<BookOpen />} title="Opinion text unavailable" detail="CourtListener did not provide an opinion record for this case." />}</div>}
        {tab === "parties" && <DeferredParticipants clusterId={clusterId} docketId={docketId} kind="party" />}
        {tab === "attorneys" && <DeferredParticipants clusterId={clusterId} docketId={docketId} kind="attorney" />}
        {tab === "citations" && <DeferredCitations clusterId={clusterId} opinionId={mainOpinionId} mode="graph" />}
        {tab === "citing" && <DeferredCitations clusterId={clusterId} opinionId={mainOpinionId} mode="citing" />}
        {tab === "authorities" && <DeferredCitations clusterId={clusterId} opinionId={mainOpinionId} mode="cited" />}
        {tab === "docket" && <DeferredDocketSection clusterId={clusterId} docketId={docketId} docket={docket} title={title} mode="timeline" />}
        {tab === "documents" && <DeferredDocketSection clusterId={clusterId} docketId={docketId} docket={docket} title={title} mode="documents" />}
        {tab === "related" && <div className="result-list">{opinions.map((opinion, index) => <OpinionCard item={opinion} key={first(opinion.id, index)} />)}</div>}
        {tab === "oral" && <DeferredOralArguments clusterId={clusterId} docketId={docketId} />}
        {tab === "raw" && <div className="technical-view"><div className="banner neutral"><Code2 size={16} />Internal IDs, endpoint payloads, and debug metadata are shown here for technical review.</div><JsonBlock value={data} /></div>}
      </section>
    </article>
  );
}

function opinionTypeLabel(opinion: JsonObject): string {
  const value = first(opinion.type_name, opinion.type, "Opinion");
  const types: Record<string, string> = { "010combined": "Combined opinion", "020lead": "Majority opinion", "025plurality": "Plurality opinion", "030concurrence": "Concurrence", "040dissent": "Dissent", "050addendum": "Addendum" };
  return types[value] || humanize(value);
}

function CaseOverview({ clusterId, mainOpinionId, caseTitle, cluster, docket, opinions, onLocate, onNavigate }: { clusterId: string; mainOpinionId: number | null; caseTitle: string; cluster: JsonObject; docket: JsonObject; opinions: JsonObject[]; onLocate: (source: SourcePassage) => void; onNavigate: (tab: string) => void }) {
  const syllabus = stripMarkup(cluster.syllabus);
  const posture = first(cluster.posture, cluster.procedural_history);
  const nature = first(cluster.suit_nature, cluster.suitNature, docket.nature_of_suit);
  return <><CaseAnalysisPanel clusterId={clusterId} opinionId={mainOpinionId} caseTitle={caseTitle} onLocate={onLocate} onNavigate={onNavigate} /><div className="case-overview case-overview-secondary">
    <section className="case-context"><span className="eyebrow">Case context</span><h2>At a glance</h2>{syllabus ? <p>{syllabus.slice(0, 1800)}</p> : posture ? <p>{posture}</p> : <p>CourtListener did not supply a syllabus or procedural summary. Review the opinion and docket for authoritative context.</p>}<dl>{posture && <div><dt>Procedural posture</dt><dd>{posture}</dd></div>}{nature && <div><dt>Nature of suit</dt><dd>{nature}</dd></div>}<div><dt>Opinion composition</dt><dd>{opinions.map(opinionTypeLabel).join(", ") || "Not supplied"}</dd></div></dl></section>
    <aside className="case-context-links"><h3>Research this decision</h3><button onClick={() => onNavigate("opinion")}><BookOpen size={18} /><span><strong>Read the opinion</strong><small>{opinions.length} opinion record{opinions.length === 1 ? "" : "s"}</small></span><ChevronRight size={16} /></button><button onClick={() => onNavigate("authorities")}><GitFork size={18} /><span><strong>Authorities cited</strong><small>Load citation relationships</small></span><ChevronRight size={16} /></button><button onClick={() => onNavigate("citing")}><Network size={18} /><span><strong>Citing decisions</strong><small>Trace subsequent citations</small></span><ChevronRight size={16} /></button><button onClick={() => onNavigate("parties")}><Users size={18} /><span><strong>Parties and counsel</strong><small>Load linked docket participants</small></span><ChevronRight size={16} /></button></aside>
  </div></>;
}

function DeferredParticipants({ clusterId, docketId, kind }: { clusterId: string; docketId: number | null; kind: "party" | "attorney" }) {
  const { data, error, loading, reload } = useLoad<JsonObject>(() => docketId ? cachedApi<JsonObject>(`/api/cases/${clusterId}/section/participants?docketId=${docketId}&mode=${kind}`) : Promise.resolve({}), [clusterId, docketId, kind]);
  if (!docketId) return <EmptyState icon={<Users />} title="No linked docket" detail="Participant records require a docket linked to this decision." />;
  if (loading) return <Loading label="Loading parties and counsel…" />;
  if (error) return <div className="banner error"><AlertTriangle size={16} /><span>{error}</span><button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>;
  const selected = kind === "party" ? data?.parties : data?.attorneys;
  const upstreamError = returnedError(selected);
  if (upstreamError) return <div className="banner error"><AlertTriangle size={16} />{upstreamError}</div>;
  return <LegalPeopleList rows={records(selected)} kind={kind} />;
}

function DeferredCitations({ clusterId, opinionId, mode }: { clusterId: string; opinionId: number | null; mode: "graph" | "citing" | "cited" }) {
  const { data, error, loading, reload } = useLoad<JsonObject>(() => opinionId ? cachedApi<JsonObject>(`/api/cases/${clusterId}/section/citations?opinionId=${opinionId}&mode=${mode}`) : Promise.resolve({}), [clusterId, opinionId, mode]);
  if (!opinionId) return <EmptyState icon={<GitFork />} title="No primary opinion" detail="Citation relationships require a linked CourtListener opinion." />;
  if (loading) return <Loading label="Loading citation relationships…" />;
  if (error) return <div className="banner error"><AlertTriangle size={16} /><span>{error}</span><button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>;
  const cites = records(data?.cites); const citedBy = records(data?.citedBy);
  const citationErrors = [returnedError(data?.cites), returnedError(data?.citedBy)].filter(Boolean);
  if (mode === "graph") return <>{citationErrors.map((message) => <div className="banner error" key={message}><AlertTriangle size={16} />{message}</div>)}<CitationGraphView selectedId={opinionId} cites={cites} citedBy={citedBy} /></>;
  const selectedError = returnedError(mode === "citing" ? data?.citedBy : data?.cites);
  if (selectedError) return <div className="banner error"><AlertTriangle size={16} />{selectedError}</div>;
  return <AuthorityList rows={mode === "citing" ? citedBy : cites} side={mode === "citing" ? "citing" : "cited"} empty={mode === "citing" ? "No citing decisions were returned by CourtListener." : "No cited authorities were returned by CourtListener."} />;
}

function DeferredDocketSection({ clusterId, docketId, docket, title, mode }: { clusterId: string; docketId: number | null; docket: JsonObject; title: string; mode: "timeline" | "documents" }) {
  const { data, error, loading, reload } = useLoad<JsonObject>(() => docketId ? cachedApi<JsonObject>(`/api/cases/${clusterId}/section/docket?docketId=${docketId}&mode=${mode}`) : Promise.resolve({}), [clusterId, docketId, mode]);
  if (!docketId) return <EmptyState icon={<BriefcaseBusiness />} title="No linked docket" detail="CourtListener did not link a docket to this opinion cluster." />;
  if (loading) return <Loading label="Loading docket activity and documents…" />;
  if (error) return <div className="banner error"><AlertTriangle size={16} /><span>{error}</span><button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>;
  const selected = mode === "timeline" ? data?.entries : data?.documents;
  const upstreamError = returnedError(selected);
  if (upstreamError) return <div className="banner error"><AlertTriangle size={16} />{upstreamError}</div>;
  return <><div className="section-action"><div><h2>{first(docket.docket_number, "Linked docket")}</h2><p>{first(docket.case_name, title)}</p></div><Link className="secondary" to={`/dockets/${docketId}`}>Open full docket <ChevronRight size={15} /></Link></div>{mode === "timeline" ? <DocketTimeline entries={records(data?.entries)} /> : <DocumentCards documents={records(data?.documents)} />}</>;
}

function DeferredOralArguments({ clusterId, docketId }: { clusterId: string; docketId: number | null }) {
  const { data, error, loading, reload } = useLoad<JsonObject>(() => docketId ? cachedApi<JsonObject>(`/api/cases/${clusterId}/section/oral?docketId=${docketId}`) : Promise.resolve({}), [clusterId, docketId]);
  if (!docketId) return <EmptyState icon={<AudioLines />} title="No linked docket" detail="Oral-argument records require a docket linked to this decision." />;
  if (loading) return <Loading label="Loading oral arguments…" />;
  if (error) return <div className="banner error"><AlertTriangle size={16} /><span>{error}</span><button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>;
  const upstreamError = returnedError(data?.audio);
  if (upstreamError) return <div className="banner error"><AlertTriangle size={16} />{upstreamError}</div>;
  return <OralRecords rows={records(data?.audio)} />;
}

function AuthorityList({ rows, side, empty }: { rows: JsonObject[]; side: "citing" | "cited"; empty: string }) {
  if (!rows.length) return <EmptyState icon={<GitFork />} title="No citation relationships returned" detail={empty} />;
  return <div className="authority-list">{rows.map((row, index) => { const id = relationId(row, side); const nested = asObject(row[`${side}_opinion`]); const title = first(row.case_name, nested.case_name, row.description, `CourtListener opinion ${id ?? ""}`); return <article key={first(row.id, id, index)}><div className="authority-direction">{side === "cited" ? "Cited authority" : "Citing decision"}</div><div><h3>{title}</h3><p>{first(row.citation, nested.citation, row.depth && `Citation depth ${row.depth}`, "Citation relationship recorded by CourtListener")}</p></div>{id && <Link className="secondary compact" to={`/documents/opinion/${id}`}>Read opinion <ChevronRight size={14} /></Link>}</article>; })}</div>;
}

function OpinionReader({ opinionId, opinion, caseTitle, citation, court, decisionDate, initialQuery = "" }: { opinionId: number; opinion: JsonObject; caseTitle: string; citation: string; court: string; decisionDate: unknown; initialQuery?: string }) {
  const notify = useNotice();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const opinionBodyRef = useRef<HTMLDivElement | null>(null);
  const { data, error, loading, reload } = useLoad(() => post<ToolResult>("/api/documents/read", { opinion_id: opinionId }), [opinionId]);
  const payload = asObject(data?.data);
  const text = first(payload.text);
  const hasMarkup = /<\/?[a-z][\s\S]*>/i.test(text);
  const sanitized = useMemo(() => hasMarkup ? DOMPurify.sanitize(text, { USE_PROFILES: { html: true }, FORBID_TAGS: ["form", "input", "button", "iframe", "object", "embed", "style", "script"] }) : "", [hasMarkup, text]);
  const pdf = safeDocumentUrl(opinion.download_url ?? opinion.local_path);
  useEffect(() => {
    if (!initialQuery.trim() || !text || !opinionBodyRef.current) return;
    const root = opinionBodyRef.current;
    const normalized = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const needle = normalized(initialQuery).slice(0, 110);
    setQuery(initialQuery.slice(0, 180));
    root.querySelectorAll(".opinion-source-focus").forEach((element) => element.classList.remove("opinion-source-focus"));
    const target = [...root.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, pre")]
      .find((element) => normalized(element.textContent || "").includes(needle));
    if (target) {
      target.classList.add("opinion-source-focus");
      window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  }, [initialQuery, opinionId, text]);
  async function searchOpinion(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError("");
    setMatches(null);
    try { const result = await post<ToolResult>("/api/documents/search", { opinion_id: opinionId, query }); setMatches(result.data); }
    catch (reason) { setSearchError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSearching(false); }
  }
  function downloadText() {
    const content = `${caseTitle}\n${citation}\n${court}\n${formatDate(decisionDate)}\n\n${stripMarkup(text)}\n\nSource: CourtListener, opinion ${opinionId}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${caseTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 100) || "opinion"}.txt`; anchor.click(); URL.revokeObjectURL(url);
    notify({ kind: "success", message: "Opinion text downloaded" });
  }
  if (loading) return <Loading label="Preparing the opinion for reading…" />;
  if (error) return <div className="banner error"><AlertTriangle size={17} /><span>{error}</span><button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>;
  return <section className="legal-opinion">
    <header className="opinion-document-header"><span>{opinionTypeLabel(opinion)}</span><h2>{caseTitle}</h2>{citation && <p>{citation}</p>}<div>{[court, formatDate(decisionDate), first(opinion.author_str, opinion.author)].filter(Boolean).join(" · ")}</div></header>
    <div className="opinion-reader-tools"><form onSubmit={searchOpinion}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find language in this opinion" /><button className="secondary compact" disabled={searching || !query.trim()}>{searching ? <LoaderCircle className="spin" size={14} /> : "Find"}</button></form><div>{pdf && <a className="secondary compact" href={pdf} target="_blank" rel="noreferrer"><Download size={15} />Original PDF</a>}<button className="secondary compact" disabled={!text} onClick={downloadText}><Download size={15} />Text</button><button className="secondary compact" onClick={() => window.print()}><Printer size={15} />Print / PDF</button></div></div>
    {searchError && <div className="banner error opinion-matches"><AlertTriangle size={16} />{searchError}</div>}
    {matches !== null && <details className="opinion-matches" open><summary>Matches for “{query}”</summary><JsonBlock value={matches} /></details>}
    {Boolean(payload.error) && <div className="banner warn"><AlertTriangle size={17} />{first(payload.error)}</div>}
    {text ? <div ref={opinionBodyRef} className={`opinion-body ${hasMarkup ? "rich-opinion" : "plain-opinion"}`}>{hasMarkup ? <div dangerouslySetInnerHTML={{ __html: sanitized }} /> : text.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div> : <EmptyState icon={<BookOpen />} title="Opinion text unavailable" detail="The case record exists, but CourtListener did not return full text for this opinion." />}
    <footer className="opinion-source">Source: CourtListener · Opinion {opinionId} · Verify quotations against the original court document before filing.</footer>
  </section>;
}

function DetailCard({ title, value }: { title: string; value: unknown }) {
  const object = asObject(value);
  const entries = Object.entries(object).filter(([, item]) => item !== null && item !== undefined && item !== "" && typeof item !== "object").slice(0, 12);
  return <article className="detail-card"><h3>{title}</h3>{entries.length ? <dl>{entries.map(([key, item]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(item).slice(0, 500)}</dd></div>)}</dl> : <p>No linked data returned.</p>}</article>;
}

function LegalPeopleList({ rows, kind }: { rows: JsonObject[]; kind: "party" | "attorney" }) {
  if (!rows.length) return <EmptyState icon={kind === "party" ? <Users /> : <UserRound />} title={`No ${kind === "party" ? "parties" : "attorneys"} returned`} detail="CourtListener may not have structured participant data for this record." />;
  return <div className="legal-people-list">{rows.map((row, index) => {
    const person = asObject(row.person ?? row.attorney);
    const name = first(row.name, row.name_full, person.name_full, [row.name_first, row.name_middle, row.name_last].filter(Boolean).join(" "), `${humanize(kind)} ${index + 1}`);
    const role = first(row.type_name, row.party_type, row.role, row.designation, kind);
    const organization = first(row.firm_name, row.organization_name, row.company, row.contact_raw);
    return <article key={first(row.id, index)}><div className="person-monogram">{name.slice(0, 1).toUpperCase()}</div><div><span className="eyebrow">{humanize(role)}</span><h3>{name}</h3>{organization && <p>{organization}</p>}<div className="person-details">{first(row.email) && <span>{first(row.email)}</span>}{first(row.phone) && <span>{first(row.phone)}</span>}{first(row.date_terminated) && <span>Ended {formatDate(row.date_terminated)}</span>}</div></div><details className="technical-details"><summary>Record details</summary><JsonBlock value={row} collapsed /></details></article>;
  })}</div>;
}

function OpinionCard({ item }: { item: JsonObject }) {
  const opinionId = idFrom(item.id);
  const clusterId = idFrom(item.cluster);
  const pdf = safeDocumentUrl(item.download_url ?? item.local_path);
  return <article className="opinion-card"><div><span className="collection-badge">{opinionTypeLabel(item)}</span><h3>{first(item.author_str, item.author, item.per_curiam ? "Per curiam" : "Judicial opinion")}</h3><p>{first(item.joined_by_str, item.page_count && `${item.page_count} pages`, "CourtListener opinion record")}</p></div><div className="opinion-actions">{opinionId && <Link className="secondary compact" to={`/documents/opinion/${opinionId}`}>Read opinion</Link>}{pdf && <a className="text-button" href={pdf} target="_blank" rel="noreferrer">PDF <ExternalLink size={13} /></a>}{opinionId && <Link className="text-button" to={`/citations?opinion=${opinionId}`}>Citations</Link>}{clusterId && <details className="technical-details"><summary>Record details</summary><code>Cluster {clusterId}</code></details>}</div></article>;
}

function DocketWorkspace() {
  const { docketId = "" } = useParams();
  const { data, error, loading, reload } = useLoad(() => api<JsonObject>(`/api/dockets/${docketId}/workspace`), [docketId]);
  const [tab, setTab] = useState("overview");
  if (loading) return <Loading label="Loading the federal docket summary…" />;
  if (error || !data) return <EmptyState icon={<AlertTriangle />} title="Docket unavailable" detail={error || "No data returned."} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  const docket = asObject(data.docket);
  const docketCourt = courtDisplay(docket.court_name, docket.court_id, docket.court);
  const docketOverview = {
    case_name: first(docket.case_name_full, docket.case_name),
    docket_number: docket.docket_number,
    court: docketCourt,
    date_filed: docket.date_filed,
    date_terminated: docket.date_terminated,
    date_last_filing: docket.date_last_filing,
    nature_of_suit: docket.nature_of_suit,
    cause: docket.cause,
    jury_demand: docket.jury_demand,
    assigned_judge: docket.assigned_to_str,
    referred_judge: docket.referred_to_str,
    source: first(docket.source) ? "CourtListener / RECAP" : "CourtListener",
  };
  return (
    <>
      <PageHeader eyebrow="PACER / RECAP workspace" title={first(docket.case_name, docket.case_name_full, `Docket ${docketId}`)} description={[first(docket.docket_number), docketCourt, formatDate(docket.date_filed)].filter(Boolean).join(" · ")} action={<button className="secondary" onClick={reload}><RefreshCw size={16} />Refresh summary</button>} />
      <div className="workspace-summary">
        <div><small>Docket number</small><strong>{first(docket.docket_number, "Unavailable")}</strong></div>
        <div><small>Court</small><strong>{docketCourt || "Unavailable"}</strong></div>
        <div><small>Filed</small><strong>{formatDate(docket.date_filed)}</strong></div>
        <div><small>Archive source</small><strong>{first(docket.source) ? "CourtListener / RECAP" : "CourtListener"}</strong></div>
      </div>
      <div className="banner neutral"><ShieldCheck size={16} />This workspace shows records available through CourtListener and the public RECAP archive. It does not purchase documents from PACER or imply that RECAP coverage is complete.</div>
      <SectionTabs active={tab} onChange={setTab} tabs={[["overview", "Overview"], ["timeline", "Docket Timeline"], ["documents", "RECAP Documents"], ["parties", "Parties"], ["attorneys", "Attorneys"], ["oral", "Oral Arguments"], ["raw", "Technical data"]]} />
      <section className="workspace-panel">
        {tab === "overview" && <DetailCard title="Docket overview" value={docketOverview} />}
        {tab === "raw" && <JsonBlock value={data} />}
        {!['overview', 'raw'].includes(tab) && <DocketSection docketId={docketId} section={tab} />}
      </section>
    </>
  );
}

function DocketSection({ docketId, section }: { docketId: string; section: string }) {
  const { data, error, loading, reload } = useLoad(
    () => cachedApi<JsonObject>(`/api/dockets/${docketId}/section/${section}`),
    [docketId, section],
  );
  if (loading) return <Loading label={`Loading ${section.replaceAll("-", " ")} from CourtListener…`} />;
  if (error) return <EmptyState icon={<AlertTriangle />} title={`${humanize(section)} unavailable`} detail={error} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  const items = records(data?.data);
  if (section === "timeline") return <DocketTimeline entries={items} />;
  if (section === "documents") return <DocumentCards documents={items} />;
  if (section === "parties") return <LegalPeopleList rows={items} kind="party" />;
  if (section === "attorneys") return <LegalPeopleList rows={items} kind="attorney" />;
  if (section === "oral") return <OralRecords rows={items} />;
  return <EmptyState icon={<FileSearch />} title="Section unavailable" detail="This docket section is not supported." />;
}

function DocketTimeline({ entries }: { entries: JsonObject[] }) {
  if (!entries.length) return <EmptyState icon={<Clock3 />} title="No docket entries returned" detail="CourtListener/RECAP coverage may be incomplete; absence is not proof that no filing exists." />;
  return <div className="timeline">{entries.map((entry, index) => <article key={first(entry.id, index)}><div className="timeline-marker"><span /></div><time>{formatDate(entry.date_filed)}</time><div><h3>{first(entry.description, entry.short_description, `Docket entry ${first(entry.entry_number, index + 1)}`)}</h3><p>Entry {first(entry.entry_number, "—")} · {first(entry.document_number, entry.pacer_sequence_number, "CourtListener record")}</p></div></article>)}</div>;
}

async function confirmedCall(tool: string, args: JsonObject): Promise<ToolResult | null> {
  const challenge = await post<ConfirmationChallenge>("/api/actions/prepare", { tool, arguments: args });
  if (!window.confirm(`${challenge.summary}\n\nThis changes the connected CourtListener account. Continue?`)) return null;
  return post<ToolResult>("/api/mcp/call", { tool, arguments: args, challengeId: challenge.challengeId });
}

function DocumentCards({ documents }: { documents: JsonObject[] }) {
  const notify = useNotice();
  const [busy, setBusy] = useState<number | null>(null);
  async function pray(id: number) {
    setBusy(id);
    try {
      const result = await confirmedCall("pray_for_document", { recap_document_id: id });
      if (result) notify({ kind: "success", message: first(result.data, "Pray and Pay request recorded") });
    } catch (error) {
      notify({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }
  if (!documents.length) return <EmptyState icon={<FileSearch />} title="No RECAP documents returned" detail="The docket may have filings that have not been contributed to the RECAP archive." />;
  const ordered = [...documents].sort((left, right) => {
    const leftNumber = Number(first(left.document_number)) || Number.MAX_SAFE_INTEGER;
    const rightNumber = Number(first(right.document_number)) || Number.MAX_SAFE_INTEGER;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return (Number(first(left.attachment_number)) || 0) - (Number(first(right.attachment_number)) || 0);
  });
  return <div className="document-grid">{ordered.map((document, index) => {
    const id = idFrom(document.id);
    const available = document.is_available === true || first(document.is_available).toLowerCase() === "true";
    const pdf = safeDocumentUrl(document.download_url ?? document.filepath_local ?? document.local_path);
    return <article className="document-card" key={first(id, index)}><div className="document-icon"><FileSearch size={20} /></div><div><span className="eyebrow">{first(document.attachment_number) ? `Attachment ${first(document.attachment_number)}` : `Document ${first(document.document_number, "—")}`}</span><h3>{first(document.description, document.short_description, `RECAP document ${id ?? ""}`)}</h3><p>{first(document.page_count) ? `${first(document.page_count)} pages` : "Page count unavailable"} · {available ? "Available in RECAP" : "Not yet available"}{first(document.date_upload) && ` · Added ${formatDate(document.date_upload)}`}</p></div><div className="document-actions">{available && id && <Link className="secondary compact" to={`/documents/recap/${id}`}>Read document</Link>}{pdf && <a className="text-button" href={pdf} target="_blank" rel="noreferrer"><Download size={14} />PDF</a>}{!available && id && <button className="secondary compact" disabled={busy === id} onClick={() => void pray(id)}>{busy === id ? <LoaderCircle className="spin" size={15} /> : <Bell size={15} />}Request via Pray and Pay</button>}</div></article>;
  })}</div>;
}

function DocumentReader() {
  const { kind = "opinion", id = "" } = useParams();
  const [chunk, setChunk] = useState(0);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const args = kind === "recap" ? { recap_document_id: Number(id), chunk_index: chunk, chunk_size: 12_000 } : { opinion_id: Number(id), chunk_index: chunk, chunk_size: 12_000 };
  const { data, error, loading, reload } = useLoad(() => post<ToolResult>("/api/documents/read", args), [kind, id, chunk]);
  const payload = asObject(data?.data);
  const documentText = first(payload.text);
  const hasMarkup = /<\/?[a-z][\s\S]*>/i.test(documentText);
  const sanitized = useMemo(() => hasMarkup ? DOMPurify.sanitize(documentText, { USE_PROFILES: { html: true }, FORBID_TAGS: ["form", "input", "button", "iframe", "object", "embed", "style", "script"] }) : "", [documentText, hasMarkup]);
  async function searchDoc(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError("");
    setSearchResult(null);
    try {
      const response = await post<ToolResult>("/api/documents/search", { ...args, chunk_index: undefined, chunk_size: undefined, query });
      setSearchResult(response.data);
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSearching(false);
    }
  }
  return (
    <>
      <PageHeader eyebrow={kind === "recap" ? "RECAP filing" : "Opinion reader"} title={kind === "recap" ? "Federal court document" : "Judicial opinion"} description="Read the CourtListener source in a focused legal-document view. Search for exact language or print the document for review." />
      <form className="document-search" onSubmit={searchDoc}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search within this document…" /><button className="secondary" disabled={searching || !query.trim()}>{searching ? <LoaderCircle className="spin" size={14} /> : null}Find text</button></form>
      {searchError && <div className="banner error"><AlertTriangle size={17} />{searchError}</div>}
      {searchResult && <details className="panel opinion-matches" open><summary>Document-search matches</summary><JsonBlock value={searchResult} /></details>}
      {loading && <Loading label="Reading CourtListener document…" />}
      {error && <div className="banner error"><AlertTriangle size={17} /><span>{error}</span><button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>}
      {data && <section className="document-reader legal-opinion"><div className="reader-toolbar"><button className="secondary compact" disabled={chunk === 0} onClick={() => setChunk((value) => Math.max(0, value - 1))}>Previous section</button><span>Section {chunk + 1}{payload.total_chunks ? ` of ${payload.total_chunks}` : ""}</span><button className="secondary compact" disabled={Number(payload.total_chunks) > 0 && chunk + 1 >= Number(payload.total_chunks)} onClick={() => setChunk((value) => value + 1)}>Next section</button><button className="secondary compact" onClick={() => window.print()}><Printer size={14} />Print / PDF</button></div>{payload.error ? <div className="banner warn"><AlertTriangle size={16} />{first(payload.error)}</div> : documentText ? <div className={`opinion-body ${hasMarkup ? "rich-opinion" : "plain-opinion"}`}>{hasMarkup ? <div dangerouslySetInnerHTML={{ __html: sanitized }} /> : documentText.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div> : <EmptyState icon={<BookOpen />} title="No document text returned" detail="CourtListener may have the record without a text transcription." />}<footer className="opinion-source">Source: CourtListener · Record {id}</footer></section>}
    </>
  );
}

function CitationsPage() {
  const [params] = useSearchParams();
  const [opinionId, setOpinionId] = useState(params.get("opinion") || "");
  const [result, setResult] = useState<JsonObject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try { setResult(await api<JsonObject>(`/api/opinions/${Number(opinionId)}/citations`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  const citationErrors = result ? [returnedError(result.opinion), returnedError(result.cites), returnedError(result.citedBy)].filter(Boolean) : [];
  return (
    <>
      <PageHeader eyebrow="Authority relationships" title="Citation Network" description="Investigate what an opinion cites and which opinions cite it. Network edges come directly from CourtListener's opinions-cited data." />
      <form className="inline-form" onSubmit={submit}><label>Opinion ID<input type="number" min="1" value={opinionId} onChange={(event) => setOpinionId(event.target.value)} placeholder="CourtListener opinion ID" /></label><button className="primary" disabled={busy || !opinionId}>{busy ? <LoaderCircle className="spin" size={16} /> : <GitFork size={16} />}Build network</button></form>
      {error && <div className="banner error"><AlertTriangle size={17} />{error}</div>}
      {citationErrors.map((message) => <div className="banner error" key={message}><AlertTriangle size={17} />{message}</div>)}
      {result ? <CitationGraphView selectedId={Number(opinionId)} cites={records(result.cites)} citedBy={records(result.citedBy)} /> : <EmptyState icon={<GitFork />} title="Select an opinion" detail="Open a case workspace to locate its opinion ID, or enter a known CourtListener opinion ID." />}
    </>
  );
}

function relationId(item: JsonObject, side: "citing" | "cited"): number | null {
  return idFrom(item[`${side}_opinion`] ?? item[`${side}_opinion_id`] ?? item[side]);
}

function CitationGraphView({ selectedId, cites, citedBy }: { selectedId: number; cites: JsonObject[]; citedBy: JsonObject[] }) {
  const left = cites.slice(0, 12).map((item) => relationId(item, "cited")).filter(Boolean) as number[];
  const right = citedBy.slice(0, 12).map((item) => relationId(item, "citing")).filter(Boolean) as number[];
  const height = Math.max(360, Math.max(left.length, right.length) * 46 + 80);
  const positions = (values: number[], x: number) => values.map((id, index) => ({ id, x, y: 55 + (index + 0.5) * ((height - 110) / Math.max(values.length, 1)) }));
  const leftNodes = positions(left, 130);
  const rightNodes = positions(right, 870);
  const center = { x: 500, y: height / 2 };
  return (
    <section className="citation-network">
      <div className="network-legend"><span><i className="edge-out" />Cases it cites ({cites.length})</span><span><i className="edge-in" />Cases citing it ({citedBy.length})</span><small>Showing up to 12 on each side</small></div>
      <div className="graph-scroll"><svg viewBox={`0 0 1000 ${height}`} role="img" aria-label="Citation relationship graph">
        {leftNodes.map((node) => <line className="out-line" key={`l-${node.id}`} x1={center.x - 50} y1={center.y} x2={node.x + 50} y2={node.y} />)}
        {rightNodes.map((node) => <line className="in-line" key={`r-${node.id}`} x1={center.x + 50} y1={center.y} x2={node.x - 50} y2={node.y} />)}
        <g className="selected-node"><circle cx={center.x} cy={center.y} r="64" /><text x={center.x} y={center.y - 4}>Selected opinion</text><text className="node-id" x={center.x} y={center.y + 20}>#{selectedId}</text></g>
        {leftNodes.map((node) => <g className="case-node" key={node.id}><circle cx={node.x} cy={node.y} r="46" /><text x={node.x} y={node.y - 3}>Opinion</text><text className="node-id" x={node.x} y={node.y + 17}>#{node.id}</text></g>)}
        {rightNodes.map((node) => <g className="case-node citing" key={node.id}><circle cx={node.x} cy={node.y} r="46" /><text x={node.x} y={node.y - 3}>Opinion</text><text className="node-id" x={node.x} y={node.y + 17}>#{node.id}</text></g>)}
      </svg></div>
      <div className="two-column compact-columns"><div><h3>Cases it cites</h3><AuthorityList rows={cites} side="cited" empty="No cited authorities were returned by CourtListener." /></div><div><h3>Cases citing it</h3><AuthorityList rows={citedBy} side="citing" empty="No citing decisions were returned by CourtListener." /></div></div>
      <div className="banner neutral"><AlertTriangle size={16} />A citation relationship does not establish positive or negative treatment. Review the citing opinion and use a citator for current-law treatment.</div>
    </section>
  );
}

type CitationVerificationRecord = {
  citation: string;
  status: string;
  caseName: string;
  court: string;
  date: string;
  clusterId: number | null;
  url: string | null;
  references: string;
  warning: string;
  candidates: string[];
};

type ParsedCitationVerification = {
  summary: string[];
  records: CitationVerificationRecord[];
  jobId: string;
  pending: boolean;
  raw: string;
};

function normalizedCitationStatus(value: unknown): string {
  const raw = first(value).toUpperCase();
  if (["200", "GOOD", "VERIFIED", "FOUND"].some((value) => raw.startsWith(value))) return "FOUND";
  if (["300", "AMBIGUOUS"].some((value) => raw.startsWith(value))) return "AMBIGUOUS";
  if (["404", "BAD", "NOT FOUND"].some((value) => raw.startsWith(value))) return "NOT FOUND";
  if (["400", "INVALID"].some((value) => raw.startsWith(value))) return "INVALID";
  if (raw.startsWith("UNRESOLVABLE")) return "UNRESOLVABLE";
  if (raw.startsWith("PENDING")) return "PENDING";
  return raw || "REVIEW REQUIRED";
}

function parseCitationVerification(value: unknown): ParsedCitationVerification {
  const object = asObject(value);
  const objectRows = records(object.results ?? object.citations);
  if (objectRows.length) {
    const mapped = objectRows.map((row): CitationVerificationRecord => ({
      citation: first(row.citation, row.cite, "Citation not supplied"),
      status: normalizedCitationStatus(row.status),
      caseName: first(row.case_name, row.caseName, row.name),
      court: courtDisplay(row.court, row.court_name),
      date: first(row.date, row.date_filed, row.dateFiled),
      clusterId: idFrom(row.cluster_id ?? row.cluster),
      url: absoluteCourtListenerUrl(row.absolute_url ?? row.url),
      references: first(row.references, row.reference_count),
      warning: first(row.warning, row.discrepancy, row.error_message),
      candidates: records(row.clusters).map((candidate) => first(candidate.case_name, candidate.name)).filter(Boolean),
    }));
    return {
      summary: [`${mapped.length} citation${mapped.length === 1 ? "" : "s"} returned by CourtListener.`],
      records: mapped,
      jobId: first(object.job_id, object.jobId),
      pending: mapped.some((row) => row.status === "PENDING") || Number(object.pending) > 0,
      raw: JSON.stringify(value, null, 2),
    };
  }

  const raw = typeof value === "string" ? value : value ? JSON.stringify(value, null, 2) : "";
  const lines = raw.split(/\r?\n/);
  const summary = lines.filter((line) => /^(Extraction:|Verification:|WARNING:)/.test(line.trim())).map((line) => line.trim());
  const jobId = raw.match(/Citation Analysis \(Job ID: ([^)]+)\)/)?.[1] || "";
  const parsed: CitationVerificationRecord[] = [];
  let current: CitationVerificationRecord | null = null;
  let section: "cases" | "unresolved" | null = null;
  const finish = () => { if (current) parsed.push(current); current = null; };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "Cases:" || /^Newly verified \(\d+\):$/.test(trimmed)) { finish(); section = "cases"; continue; }
    if (trimmed === "Unresolved:") { finish(); section = "unresolved"; continue; }
    if (trimmed === "Statutes:") { finish(); section = null; continue; }
    if (section === "unresolved") {
      const unresolved = line.match(/^\s*\d+\.\s+\[([^\]]+)]\s+"([^"]+)"(?:\s+—\s+(.+))?$/);
      if (unresolved) parsed.push({ citation: unresolved[2], status: "UNRESOLVABLE", caseName: `${unresolved[1]} could not be linked to a full authority.`, court: "", date: "", clusterId: null, url: null, references: unresolved[3] || "", warning: "", candidates: [] });
      continue;
    }
    if (section !== "cases") continue;
    const entry = line.match(/^\s*\d+\.\s+(.+)$/);
    if (entry) {
      finish();
      const [citation, ...caseParts] = entry[1].split(" — ");
      let caseName = caseParts.join(" — ").trim();
      let date = "";
      const dateMatch = caseName.match(/\s+\((\d{4}-\d{2}-\d{2})\)$/);
      if (dateMatch) { date = dateMatch[1]; caseName = caseName.slice(0, dateMatch.index).trim(); }
      current = { citation: citation.trim(), status: "REVIEW REQUIRED", caseName, court: "", date, clusterId: null, url: null, references: "", warning: "", candidates: [] };
      continue;
    }
    if (!current) continue;
    const status = trimmed.match(/^Status:\s+(.+)$/i)?.[1];
    if (status) current.status = normalizedCitationStatus(status);
    else if (trimmed.startsWith("WARNING:")) current.warning = trimmed.replace(/^WARNING:\s*/, "");
    else if (trimmed.startsWith("Cluster ID:")) current.clusterId = idFrom(trimmed.replace(/^Cluster ID:\s*/, ""));
    else if (trimmed.startsWith("References in document:")) current.references = trimmed.replace(/^References in document:\s*/, "");
    else if (trimmed.startsWith("URL:")) current.url = absoluteCourtListenerUrl(trimmed.replace(/^URL:\s*/, ""));
    else if (trimmed.startsWith("- ")) current.candidates.push(trimmed.slice(2));
  }
  finish();
  return { summary, records: parsed, jobId, pending: /\bpending\b/i.test(raw), raw };
}

function CitationVerificationResults({ value, onResume, resuming }: { value: unknown; onResume: (jobId: string) => void; resuming: boolean }) {
  const parsed = parseCitationVerification(value);
  if (!parsed.records.length) return <pre className="analysis-output">{parsed.raw}</pre>;
  return <div className="verification-report">
    {parsed.summary.length > 0 && <section className="verification-summary"><span className="eyebrow">CourtListener verification summary</span>{parsed.summary.map((line) => <p key={line}>{line}</p>)}</section>}
    {parsed.records.map((record, index) => {
      const mismatch = Boolean(record.warning);
      const good = record.status === "FOUND" && !mismatch;
      const bad = ["NOT FOUND", "INVALID", "UNRESOLVABLE"].includes(record.status);
      const label = mismatch ? "Potential citation mismatch" : good ? "Verified authority" : record.status === "AMBIGUOUS" ? "Ambiguous result" : bad ? "Not located / unresolved" : "Verification pending";
      return <article className={`verification-card ${good ? "good" : bad ? "bad" : "warn"}`} key={`${record.citation}-${index}`}>
        <header><div><span className="eyebrow">Citation submitted</span><h3>{record.citation}</h3></div><span className="verification-status">{label}</span></header>
        {record.caseName && <div className="verified-authority"><strong>{record.caseName}</strong>{record.date && <span>{formatDate(record.date)}</span>}</div>}
        <dl>
          {record.court && <div><dt>Court</dt><dd>{record.court}</dd></div>}
          {record.clusterId && <div><dt>CourtListener case</dt><dd>Cluster {record.clusterId}</dd></div>}
          {record.references && <div><dt>References in text</dt><dd>{record.references}</dd></div>}
          <div><dt>Verification status</dt><dd>{record.status}</dd></div>
        </dl>
        {record.warning && <div className="banner warn"><AlertTriangle size={16} />{record.warning}</div>}
        {record.candidates.length > 0 && <div className="verification-candidates"><strong>Possible matches</strong><ul>{record.candidates.map((candidate) => <li key={candidate}>{candidate}</li>)}</ul></div>}
        <footer>{record.clusterId && <Link className="secondary compact" to={`/cases/${record.clusterId}`}>Open full case <ChevronRight size={14} /></Link>}{record.url && <a className="text-button" href={record.url} target="_blank" rel="noreferrer">CourtListener record <ExternalLink size={13} /></a>}</footer>
      </article>;
    })}
    {parsed.pending && parsed.jobId && <div className="verification-resume"><div><strong>Verification is not complete</strong><span>CourtListener retained a short-lived job so the remaining citations can be checked without starting over.</span></div><button className="secondary" disabled={resuming} onClick={() => onResume(parsed.jobId)}>{resuming ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}Continue pending citations</button></div>}
    <details className="technical-details"><summary>Raw CourtListener verification report</summary><pre className="analysis-output">{parsed.raw}</pre></details>
  </div>;
}

function CitationVerification() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"analyze" | "extract">("analyze");
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await post<ToolResult>("/api/mcp/call", { tool: mode === "analyze" ? "analyze_citations" : "extract_citations", arguments: { text: input } });
      setResult(response.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function resume(jobId: string) {
    setResuming(true); setError("");
    try {
      const response = await post<ToolResult>("/api/mcp/call", { tool: "resume_citation_analysis", arguments: { job_id: jobId, wait: false } });
      setResult(response.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setResuming(false); }
  }
  return (
    <>
      <PageHeader eyebrow="Citation grounding" title="Citation Verification" description="Extract and verify legal citations against CourtListener. Formatting recognition alone never counts as verification." />
      <div className="verification-layout">
        <form className="verification-input" onSubmit={submit}>
          <div className="segmented"><button type="button" className={mode === "analyze" ? "active" : ""} onClick={() => { setMode("analyze"); setResult(null); setError(""); }}>Verify authorities</button><button type="button" className={mode === "extract" ? "active" : ""} onClick={() => { setMode("extract"); setResult(null); setError(""); }}>Extract only</button></div>
          <label>Citation or citation-containing text<textarea value={input} onChange={(event) => setInput(event.target.value)} rows={15} placeholder={'Example: Carpenter v. United States, 585 U.S. 296 (2018)\n\nPaste multiple citations or a passage containing citations.'} /></label>
          <p className="privacy-note"><ShieldCheck size={15} />Only submit public text or citation strings unless disclosure is authorized. The text is sent to CourtListener MCP and is not persisted by this application.</p>
          <button className="primary" disabled={busy || !input.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <BadgeCheck size={17} />}{mode === "analyze" ? "Verify with CourtListener" : "Extract citations"}</button>
          {error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}
        </form>
        <section className="verification-results">
          <div className="verification-key"><span className="good"><BadgeCheck size={14} />Verified authority</span><span className="warn"><AlertTriangle size={14} />Ambiguous / mismatch</span><span className="bad"><XCircle size={14} />Not located</span></div>
          {result ? <CitationVerificationResults value={result} onResume={(jobId) => void resume(jobId)} resuming={resuming} /> : <EmptyState icon={<FileCheck2 />} title="No citations analyzed" detail="Verification results will identify located, unresolved, ambiguous, and potentially mismatched citations." />}
          {result !== null && <div className="banner neutral"><AlertTriangle size={16} />“Good” in CourtListener citation analysis means the authority was resolved—not that it remains good law or supports a proposition.</div>}
        </section>
      </div>
    </>
  );
}

function OralRecords({ rows }: { rows: JsonObject[] }) {
  if (!rows.length) return <EmptyState icon={<AudioLines />} title="No oral arguments linked" detail="CourtListener did not return an associated audio record." />;
  return <div className="audio-list">{rows.map((row, index) => {
    const source = courtListenerAudioSource(row);
    const transcript = first(row.stt_transcript, row.transcript);
    const id = idFrom(row.id);
    return <article key={first(row.id, index)}><div className="audio-symbol"><Volume2 size={20} /></div><div><span className="eyebrow">{first(row.date_argued, row.dateArgued) ? formatDate(row.date_argued ?? row.dateArgued) : "CourtListener oral argument"}</span><h3>{first(row.case_name, row.title, row.description, `Oral argument ${first(row.id)}`)}</h3><p>{first(row.judges, row.panel, row.court, "Panel information unavailable")}</p>{source.streamUrl ? <audio controls preload="metadata" src={source.streamUrl} /> : <span className="muted">A browser-safe stream is not available for this record.</span>}{id && <Link className="text-button" to={`/oral-arguments/${id}`}>Open audio and transcript <ChevronRight size={14} /></Link>}{transcript && <details className="transcript-panel"><summary>View CourtListener transcript</summary><pre>{transcript}</pre></details>}</div></article>;
  })}</div>;
}

function OralArgumentWorkspace() {
  const { audioId = "" } = useParams();
  const { data, error, loading, reload } = useLoad(() => api<JsonObject>(`/api/oral-arguments/${audioId}/workspace`), [audioId]);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  if (loading) return <Loading label="Loading audio, panel, and transcript metadata…" />;
  if (error || !data) return <EmptyState icon={<AlertTriangle />} title="Oral argument unavailable" detail={error || "No record returned."} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  const record = asObject(data.audio);
  const source = courtListenerAudioSource(record);
  const transcript = first(record.stt_transcript, record.transcript);
  const paragraphs = transcript.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const visibleParagraphs = transcriptQuery.trim()
    ? paragraphs.filter((item) => item.toLowerCase().includes(transcriptQuery.trim().toLowerCase()))
    : paragraphs;
  const docketId = idFrom(record.docket);
  const courtListenerUrl = absoluteCourtListenerUrl(record.absolute_url);
  return (
    <>
      <PageHeader eyebrow="Oral argument record" title={first(record.case_name_full, record.case_name, `Oral argument ${audioId}`)} description={[first(record.judges), first(record.duration) && `${first(record.duration)} seconds`, first(record.processing_complete) === "true" ? "Processing complete" : "CourtListener audio archive"].filter(Boolean).join(" · ")} action={docketId ? <Link className="secondary" to={`/dockets/${docketId}`}>Open linked docket <ChevronRight size={15} /></Link> : null} />
      <section className="oral-player panel">
        <div className="panel-heading"><div><span className="eyebrow">CourtListener audio</span><h2>Listen to the argument</h2></div><StatusPill status={source.streamUrl ? "Audio available" : "Audio unavailable"} /></div>
        {source.streamUrl ? <><audio controls preload="metadata" src={source.streamUrl} /><p className="muted">{source.isCourtListenerCopy ? "Streaming the HTTPS copy preserved by CourtListener." : "Streaming the secure source supplied by the court."}</p></> : <EmptyState icon={<AudioLines />} title="No browser-safe recording available" detail="CourtListener has the record, but it did not provide an HTTPS media copy that this browser can play." />}
        <div className="button-row">{source.streamUrl && <a className="secondary compact" href={source.streamUrl} download><Download size={14} />Download audio</a>}{courtListenerUrl && <a className="text-button" href={courtListenerUrl} target="_blank" rel="noreferrer">View on CourtListener <ExternalLink size={13} /></a>}</div>
      </section>
      <section className="panel transcript-workspace">
        <div className="panel-heading"><div><span className="eyebrow">Speech-to-text</span><h2>Transcript</h2></div><StatusPill status={transcript ? "Available" : "Not available"} /></div>
        {transcript ? <><label className="transcript-search"><Search size={15} /><input value={transcriptQuery} onChange={(event) => setTranscriptQuery(event.target.value)} placeholder="Find words in this transcript" /></label>{transcriptQuery && <p className="muted">{visibleParagraphs.length} matching transcript section{visibleParagraphs.length === 1 ? "" : "s"}</p>}<div className="transcript-text">{visibleParagraphs.map((paragraph, index) => <p key={index}><HighlightText text={paragraph} query={transcriptQuery} /></p>)}</div></> : <EmptyState icon={<FileSearch />} title="Transcript not available" detail="CourtListener did not provide a speech-to-text transcript for this recording." />}
      </section>
    </>
  );
}

function JudgeSection({ personId, section }: { personId: string; section: "positions" | "education" | "disclosures" | "affiliations" }) {
  const { data, error, loading, reload } = useLoad(
    () => cachedApi<{ section: string; data: unknown }>(`/api/judges/${personId}/section/${section}`),
    [personId, section],
  );
  if (loading) return <Loading label={`Loading ${humanize(section).toLowerCase()}…`} />;
  if (error) return <EmptyState icon={<AlertTriangle />} title="Judicial records unavailable" detail={error} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  if (section !== "disclosures") return <RecordTable data={data?.data} />;
  const disclosures = records(data?.data);
  if (!disclosures.length) return <EmptyState icon={<CircleDollarSign />} title="No disclosure records returned" detail="CourtListener may not have a disclosure for this person or period." />;
  return <div className="disclosure-list">{disclosures.map((item, index) => {
    const id = idFrom(item.id);
    return <article key={first(id, index)}><div><span className="eyebrow">Reporting year {first(item.year, "—")}</span><h3>Financial disclosure {first(id)}</h3><p>{first(item.date_created, item.date_modified) ? `Filed ${formatDate(item.date_created ?? item.date_modified)}` : "Filing date unavailable"}</p></div>{id && <Link className="secondary compact" to={`/disclosures/${id}`}>Review disclosure</Link>}</article>;
  })}</div>;
}

function JudgeWorkspace() {
  const { personId = "" } = useParams();
  const { data, error, loading, reload } = useLoad(() => api<JsonObject>(`/api/judges/${personId}/workspace`), [personId]);
  const [tab, setTab] = useState("profile");
  if (loading) return <Loading label="Building judicial profile…" />;
  if (error || !data) return <EmptyState icon={<AlertTriangle />} title="Judicial profile unavailable" detail={error || "No data returned."} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  const person = asObject(data.person);
  const title = first(person.name_full, [person.name_first, person.name_middle, person.name_last].filter(Boolean).join(" "), `Person ${personId}`);
  return (
    <>
      <PageHeader eyebrow="Judiciary research" title={title} description={[first(person.gender), first(person.date_dob) && `Born ${formatDate(person.date_dob)}`, first(person.fjc_id) && `FJC ${first(person.fjc_id)}`].filter(Boolean).join(" · ")} action={<Link className="secondary" to={`/disclosures?person=${encodeURIComponent(personId)}&judge=${encodeURIComponent(title)}`}><CircleDollarSign size={15} />View financial disclosures</Link>} />
      <SectionTabs active={tab} onChange={setTab} tabs={[["profile", "Profile"], ["positions", "Appointments"], ["education", "Education"], ["disclosures", "Financial Disclosures"], ["affiliations", "Affiliations"], ["raw", "Metadata"]]} />
      <section className="workspace-panel">
        {tab === "profile" && <DetailCard title="Biographical information" value={person} />}
        {tab === "positions" && <JudgeSection personId={personId} section="positions" />}
        {tab === "education" && <JudgeSection personId={personId} section="education" />}
        {tab === "disclosures" && <JudgeSection personId={personId} section="disclosures" />}
        {tab === "affiliations" && <JudgeSection personId={personId} section="affiliations" />}
        {tab === "raw" && <JsonBlock value={data} />}
      </section>
    </>
  );
}

function DisclosuresPage() {
  const [params, setParams] = useSearchParams();
  const [judgeQuery, setJudgeQuery] = useState(params.get("judge") || "");
  const [judgeResults, setJudgeResults] = useState<JsonObject[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadedPerson = useRef("");
  async function loadDisclosures(personId?: number, judgeName?: string) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const query: JsonObject = { order_by: "-date_created" };
      if (personId) query.person = personId;
      const response = await post<ToolResult>("/api/endpoint/financial-disclosures", { query, numResults: 50 });
      setResult(response.data);
      setJudgeResults([]);
      if (personId) {
        loadedPerson.current = String(personId);
        setParams({ person: String(personId), ...(judgeName ? { judge: judgeName } : {}) });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function searchJudges(event: FormEvent) {
    event.preventDefault();
    if (!judgeQuery.trim()) return;
    setBusy(true);
    setError("");
    setJudgeResults([]);
    setResult(null);
    try {
      const response = await post<ToolResult>("/api/search", { query: judgeQuery, type: "p", numResults: 20 });
      setJudgeResults(records(response.data));
      setResult(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  const requestedPerson = params.get("person") || "";
  useEffect(() => {
    if (!/^\d+$/.test(requestedPerson) || loadedPerson.current === requestedPerson) return;
    void loadDisclosures(Number(requestedPerson), params.get("judge") || undefined);
  }, [requestedPerson]);
  return (
    <>
      <PageHeader eyebrow="Public judicial records" title="Financial Disclosures" description="Research disclosure reports and connected investments, debts, gifts, positions, reimbursements, and income records factually and without inference." />
      <form className="inline-form disclosure-search" onSubmit={searchJudges}><label>Judge name<input value={judgeQuery} onChange={(event) => setJudgeQuery(event.target.value)} placeholder="For example, Sonia Sotomayor" /></label><button className="primary" disabled={busy || !judgeQuery.trim()}>{busy ? <LoaderCircle className="spin" size={16} /> : <UserRoundSearch size={16} />}Find judge</button><button type="button" className="secondary" disabled={busy} onClick={() => void loadDisclosures()}>Browse recent reports</button></form>
      {error && <div className="banner error"><AlertTriangle size={17} />{error}</div>}
      {judgeResults.length > 0 && <section className="judge-picker"><div className="results-heading"><div><span className="eyebrow">Matching judicial profiles</span><h2>Choose the correct judge</h2><p>Disclosure reports are connected by CourtListener person ID after you choose a profile.</p></div></div><div className="result-list">{judgeResults.map((judge, index) => { const id = idFrom(judge.id); const name = first(judge.name_full, [judge.name_first, judge.name_middle, judge.name_last].filter(Boolean).join(" "), `Judge ${id ?? index + 1}`); return <article className="result-card" key={first(id, index)}><div className="result-topline"><span className="collection-badge">Judicial profile</span></div><h3>{name}</h3><div className="metadata-line">{first(judge.court, judge.court_name) && <span><Landmark size={14} />{first(judge.court, judge.court_name)}</span>}</div><footer><div>{id && <button className="text-button" onClick={() => void loadDisclosures(id, name)}>View disclosure reports <ChevronRight size={14} /></button>}{id && <Link className="text-button" to={`/judges/${id}`}>Open judge profile</Link>}</div></footer></article>; })}</div></section>}
      {result ? <DisclosureResults value={result} judgeName={params.get("judge") || undefined} /> : !judgeResults.length && !busy ? <EmptyState icon={<CircleDollarSign />} title="Find reports by judge" detail="Search by a judge’s name, select the matching judicial profile, and review the public reports CourtListener has for that person." /> : null}
    </>
  );
}

function DisclosureResults({ value, judgeName }: { value: unknown; judgeName?: string }) {
  const rows = records(value).sort((left, right) => Number(first(right.year)) - Number(first(left.year)) || Number(first(right.id)) - Number(first(left.id)));
  if (!rows.length) return <EmptyState icon={<CircleDollarSign />} title="No disclosure reports located" detail="CourtListener returned no reports for this judge. That may reflect collection coverage rather than the absence of a filed report." />;
  return <section><div className="results-heading"><div><span className="eyebrow">CourtListener public records</span><h2>{judgeName ? `${judgeName} — disclosure reports` : "Recent financial disclosure reports"}</h2><p>Open a report to inspect its source PDF and extracted categories. The application does not infer conflicts.</p></div></div><div className="disclosure-list">{rows.map((row, index) => { const id = idFrom(row.id); const personId = idFrom(row.person); return <article key={first(id, index)}><div><span className="eyebrow">Reporting year {first(row.year, "—")}</span><h3>{judgeName || `Judicial financial disclosure ${id ?? ""}`}</h3><p>{first(row.page_count) ? `${first(row.page_count)} pages · ` : ""}{row.has_been_extracted === true ? "Structured details available" : "Source report available"}{first(row.date_created, row.date_modified) ? ` · Added ${formatDate(row.date_created ?? row.date_modified)}` : ""}</p></div><div className="button-row">{id && <Link className="secondary compact" to={`/disclosures/${id}`}>Open report</Link>}{personId && <Link className="text-button" to={`/judges/${personId}`}>Judge profile</Link>}</div></article>; })}</div></section>;
}

function DisclosureSection({ disclosureId, section }: { disclosureId: string; section: string }) {
  const { data, error, loading, reload } = useLoad(
    () => cachedApi<{ section: string; data: unknown }>(`/api/disclosures/${disclosureId}/section/${section}`),
    [disclosureId, section],
  );
  if (loading) return <Loading label={`Loading ${humanize(section).toLowerCase()}…`} />;
  if (error) return <EmptyState icon={<AlertTriangle />} title="Disclosure details unavailable" detail={error} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  return <RecordTable data={data?.data} empty={`CourtListener returned no ${humanize(section).toLowerCase()} for this report.`} />;
}

function DisclosureWorkspace() {
  const { disclosureId = "" } = useParams();
  const { data, error, loading, reload } = useLoad(() => api<JsonObject>(`/api/disclosures/${disclosureId}/workspace`), [disclosureId]);
  const [tab, setTab] = useState("overview");
  if (loading) return <Loading label="Loading financial-disclosure report…" />;
  if (error || !data) return <EmptyState icon={<AlertTriangle />} title="Disclosure unavailable" detail={error || "No record returned."} action={<button className="secondary" onClick={reload}><RefreshCw size={15} />Try again</button>} />;
  const disclosure = asObject(data.disclosure);
  const pdf = safeDocumentUrl(disclosure.filepath);
  const sections = ["investments", "debts", "gifts", "agreements", "non-investment-incomes", "disclosure-positions", "reimbursements", "spouse-incomes"];
  return (
    <>
      <PageHeader eyebrow="Public financial record" title={`Financial Disclosure ${disclosureId}`} description={[first(disclosure.year) && `Reporting year ${first(disclosure.year)}`, first(disclosure.page_count) && `${first(disclosure.page_count)} pages`, disclosure.has_been_extracted === true ? "Structured data extracted" : "Source report"].filter(Boolean).join(" · ")} action={pdf ? <a className="secondary" href={pdf} target="_blank" rel="noreferrer"><Download size={15} />Open source PDF</a> : null} />
      <div className="banner neutral"><ShieldCheck size={16} />Values are presented from CourtListener’s public records. Review the source report before drawing any conclusion about a potential conflict.</div>
      <SectionTabs active={tab} onChange={setTab} tabs={[["overview", "Overview"], ...sections.map((name) => [name, name.replaceAll("-", " ")] as [string, string]), ["raw", "Raw data"]]} />
      <section className="workspace-panel">{tab === "overview" && <DetailCard title="Disclosure metadata" value={disclosure} />}{sections.includes(tab) && <DisclosureSection disclosureId={disclosureId} section={tab} />}{tab === "raw" && <JsonBlock value={data} />}</section>
    </>
  );
}

function AlertsPage() {
  const notify = useNotice();
  const { data, error, loading, reload } = useLoad(() => api<JsonObject>("/api/alerts"));
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [rate, setRate] = useState("dly");
  const [type, setType] = useState("o");
  const [busy, setBusy] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await confirmedCall("create_search_alert", { name, query: { q: query, type }, rate, alert_type: type });
      if (result) { notify({ kind: "success", message: "CourtListener search alert created" }); setName(""); setQuery(""); reload(); }
    } catch (reason) { notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusy(false); }
  }
  async function remove(id: number) {
    try {
      const result = await confirmedCall("delete_search_alert", { id });
      if (result) { notify({ kind: "success", message: `Alert ${id} deleted` }); reload(); }
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  const searchAlerts = records(data?.searchAlerts);
  const docketAlerts = records(data?.docketAlerts);
  const prayers = records(data?.prayers);
  const monitoringErrors = [returnedError(data?.searchAlerts), returnedError(data?.docketAlerts)].filter(Boolean);
  const prayerError = returnedError(data?.prayers);
  return (
    <>
      <PageHeader eyebrow="Legal monitoring" title="CourtListener Alerts" description="Manage CourtListener's server-side search and docket monitoring. This console does not duplicate alert delivery." action={<button className="secondary" onClick={reload}><RefreshCw size={16} />Refresh</button>} />
      {error && <div className="banner error"><AlertTriangle size={17} />{error}</div>}
      <div className="alerts-layout">
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">New monitoring rule</span><h2>Create search alert</h2></div><Bell size={19} /></div><form className="stack-form" onSubmit={create}><label>Alert name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Qualified immunity — Tenth Circuit" /></label><label>Search query<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="qualified immunity" /></label><div className="form-pair"><label>Collection<select value={type} onChange={(event) => setType(event.target.value)}><option value="o">Opinions</option><option value="r">RECAP</option><option value="d">Dockets</option><option value="oa">Oral arguments</option></select></label><label>Frequency<select value={rate} onChange={(event) => setRate(event.target.value)}><option value="rt">Real time</option><option value="dly">Daily</option><option value="wly">Weekly</option><option value="mly">Monthly</option><option value="off">Off</option></select></label></div><button className="primary" disabled={busy || !name || !query}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}Review and create</button></form></section>
        <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Account state</span><h2>Active monitoring</h2></div><StatusPill status={loading ? "Loading" : monitoringErrors.length ? "Unavailable" : "Live"} /></div>{loading ? <Loading /> : <div className="alert-list">{monitoringErrors.map((message) => <div className="banner error" key={message}><AlertTriangle size={16} />{message}</div>)}{searchAlerts.map((alert, index) => { const id = idFrom(alert.id); return <article key={first(id, index)}><div><span className="collection-badge">Search alert</span><h3>{first(alert.name, `Alert ${id ?? ""}`)}</h3><p>{first(alert.query, alert.rate, "CourtListener alert")}</p></div>{id && <button className="danger-icon" title="Delete alert" onClick={() => void remove(id)}><Trash2 size={16} /></button>}</article>; })}{docketAlerts.map((alert, index) => <article key={`d-${first(alert.id, index)}`}><div><span className="collection-badge">Docket alert</span><h3>Docket {first(alert.docket, alert.id)}</h3><p>{first(alert.date_created, alert.alert_type, "Active subscription")}</p></div></article>)}{!monitoringErrors.length && !searchAlerts.length && !docketAlerts.length && <EmptyState icon={<Bell />} title="No active alerts returned" detail="Create a search alert or subscribe from a docket workspace." />}</div>}</section>
      </div>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">RECAP requests</span><h2>Pending Pray and Pay requests</h2></div><FileSearch size={19} /></div>{prayerError ? <div className="banner error"><AlertTriangle size={16} />{prayerError}</div> : prayers.length ? <RecordTable data={prayers} /> : <p className="muted">No pending document prayers returned.</p>}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Local audit</span><h2>Action history</h2></div><Clock3 size={19} /></div><RecordTable data={data?.history} empty="No account-changing actions have been made through this console." /></section>
    </>
  );
}

function McpConsole() {
  const tools = useLoad(() => api<{ tools: McpToolDefinition[] }>("/api/mcp/tools"));
  const coverage = useLoad(() => api<{ rows: ToolCoverageRow[] }>("/api/mcp/coverage"));
  const events = useLoad(() => api<{ events: ConsoleEvent[] }>("/api/mcp/events"));
  const [selected, setSelected] = useState("");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tool = tools.data?.tools.find((item) => item.name === selected);
  useEffect(() => { if (!selected && tools.data?.tools[0]) setSelected(tools.data.tools[0].name); }, [selected, tools.data]);
  async function run(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const parsed = JSON.parse(args) as JsonObject;
      const response = tool?.annotations?.readOnlyHint === false || ["create_search_alert", "delete_search_alert", "subscribe_to_docket_alert", "unsubscribe_from_docket_alert", "pray_for_document", "withdraw_prayer"].includes(selected)
        ? await confirmedCall(selected, parsed)
        : await post<ToolResult>("/api/mcp/call", { tool: selected, arguments: parsed });
      if (response) { setResult(response); events.reload(); coverage.reload(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader eyebrow="Developer operations" title="MCP Console" description="Inspect the live official CourtListener MCP surface, schemas, calls, timing, errors, and raw responses. New upstream tools appear automatically." action={<button className="secondary" onClick={() => { tools.reload(); coverage.reload(); events.reload(); }}><RefreshCw size={16} />Rediscover</button>} />
      {[tools.error, coverage.error, events.error].filter(Boolean).map((message) => <div className="banner error" key={message}><AlertTriangle size={17} />{message}</div>)}
      <div className="console-layout">
        <section className="tool-list panel"><div className="panel-heading"><div><span className="eyebrow">Live inventory</span><h2>{tools.data?.tools.length || 0} tools</h2></div><Bot size={19} /></div>{tools.loading ? <Loading /> : tools.data?.tools.map((item) => <button key={item.name} className={selected === item.name ? "active" : ""} onClick={() => { setSelected(item.name); setArgs("{}"); setResult(null); }}><span>{item.title || item.name}</span><small>{item.name}</small></button>)}</section>
        <section className="console-main panel">{tool ? <><div className="panel-heading"><div><span className="eyebrow">{tool.annotations?.readOnlyHint === false ? "State changing" : "Read only"}</span><h2>{tool.name}</h2></div><StatusPill status={tool.annotations?.readOnlyHint === false ? "Confirmation required" : "Read only"} /></div><p>{tool.description}</p><details open><summary>Input schema</summary><JsonBlock value={tool.inputSchema} /></details><form className="console-form" onSubmit={run}><label>Arguments (JSON)<textarea spellCheck={false} rows={10} value={args} onChange={(event) => setArgs(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}Run tool</button></form>{error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}{result && <div><h3>Response</h3><JsonBlock value={result} /></div>}</> : <EmptyState icon={<Bot />} title="No MCP tool selected" detail="Connect CourtListener to inspect the live server inventory." />}</section>
      </div>
      <section className="panel coverage-panel"><div className="panel-heading"><div><span className="eyebrow">Required audit</span><h2>MCP tool coverage</h2></div><BadgeCheck size={19} /></div><div className="table-wrap"><table><thead><tr><th>Tool</th><th>Available</th><th>Implemented</th><th>UI location</th><th>Test</th><th>Result</th></tr></thead><tbody>{coverage.data?.rows.map((row) => <tr key={row.name}><td><code>{row.name}</code></td><td><StatusPill status={row.available ? "Yes" : "Pending"} /></td><td>{row.implemented ? "Yes" : "No"}</td><td>{row.uiLocation}</td><td>{row.tested}</td><td>{row.result}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Ephemeral diagnostics</span><h2>Recent calls</h2></div><Clock3 size={19} /></div><div className="event-list">{events.data?.events.map((event) => <details key={event.id}><summary><code>{event.tool}</code><span>{event.error ? "Error" : event.durationMs ? `${event.durationMs} ms` : "Running"}</span><time>{formatDate(event.startedAt)}</time></summary><JsonBlock value={event} /></details>)}</div></section>
    </>
  );
}

const endpointOptions = [
  "dockets", "docket-entries", "recap-documents", "courts", "audio", "clusters", "opinions", "opinions-cited",
  "people", "positions", "educations", "political-affiliations", "aba-ratings", "parties", "attorneys",
  "financial-disclosures", "investments", "debts", "gifts", "agreements", "non-investment-incomes",
  "disclosure-positions", "reimbursements", "spouse-incomes", "alerts", "docket-alerts", "prayers", "visualizations",
];

function ApiExplorer() {
  const [endpoint, setEndpoint] = useState("dockets");
  const [query, setQuery] = useState("{}");
  const [schema, setSchema] = useState<unknown>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function loadSchema() {
    setError("");
    setSchema(null);
    try { const response = await api<ToolResult>(`/api/endpoint-schema/${endpoint}`); setSchema(response.data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function execute(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null); setDuration(null);
    const start = performance.now();
    try { const response = await post<ToolResult>(`/api/endpoint/${endpoint}`, { query: JSON.parse(query), numResults: 20 }); setResult(response); setDuration(response.durationMs); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setDuration(Math.round(performance.now() - start)); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader eyebrow="Developer inspection" title="CourtListener API Explorer" description="Inspect read-only REST resources through the official MCP call_endpoint layer. This technical view complements the polished research workspaces." />
      <div className="api-request panel"><div className="request-line"><span className="method">GET</span><span>https://www.courtlistener.com/api/rest/v4/</span><select value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setSchema(null); setResult(null); }}>{endpointOptions.map((value) => <option key={value}>{value}</option>)}</select><span>/</span></div><div className="api-actions"><button className="secondary" onClick={() => void loadSchema()}><Code2 size={16} />Load schema</button>{duration !== null && <span>{duration} ms</span>}</div></div>
      <div className="two-column api-columns"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Request</span><h2>Query parameters</h2></div></div><form className="console-form" onSubmit={execute}><label>Filters (JSON)<textarea spellCheck={false} rows={14} value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}Execute read-only request</button></form>{schema !== null && <><h3>Endpoint schema</h3><JsonBlock value={schema} /></>}</section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">Response</span><h2>Raw CourtListener data</h2></div>{result !== null && <StatusPill status="200 via MCP" />}</div>{error && <div className="inline-error"><AlertTriangle size={16} />{error}</div>}{result !== null ? <JsonBlock value={result} /> : <EmptyState icon={<Code2 />} title="No request executed" detail="Choose an endpoint, inspect its live schema, and send supported filters." />}</section></div>
    </>
  );
}

function SettingsPage() {
  const notify = useNotice();
  const { data: status, error, loading, reload } = useLoad(() => api<ConnectionStatus & { tls: boolean }>("/api/status"));
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await put<{ ok: boolean; toolCount: number }>("/api/connections/courtlistener", { token });
      setToken(""); setShow(false); reload();
      notify({ kind: "success", message: `CourtListener connected; ${result.toolCount} MCP tools discovered` });
    } catch (reason) { notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm("Remove the saved CourtListener credential from this application? Research tools will disconnect.")) return;
    setBusy(true);
    try {
      await del("/api/connections/courtlistener", { confirm: "REMOVE" }); reload();
      notify({ kind: "success", message: "CourtListener credential removed" });
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    } finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings & Connections" description="Manage authentication and backend connections for this standalone application." />
      {error && <div className="banner error"><AlertTriangle size={17} />{error}<button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>}
      <section className="connection-panel panel">
        <div className="connection-hero"><div className="connection-logo"><Landmark size={25} /></div><div><span className="eyebrow">Official Free Law Project service</span><h2>CourtListener Connection</h2><p>Hosted MCP: https://mcp.courtlistener.com/</p></div><StatusPill status={loading ? "Checking" : status?.mcp || "Disconnected"} /></div>
        <div className="connection-details"><div><small>Credential</small><strong>{status?.credentialConfigured ? "Encrypted and configured" : "Not configured"}</strong></div><div><small>MCP tools</small><strong>{status?.toolCount || 0} discovered</strong></div><div><small>Last successful request</small><strong>{status?.lastSuccessfulRequest ? formatDate(status.lastSuccessfulRequest) : "Never"}</strong></div><div><small>Transport</small><strong>{status?.tls ? "HTTPS" : "HTTP development mode"}</strong></div></div>
        <form className="credential-form" onSubmit={save}>
          <label htmlFor="courtlistener-token">CourtListener API token</label><div className="secret-input"><input id="courtlistener-token" type={show ? "text" : "password"} value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder={status?.credentialConfigured ? "Paste a replacement token to rotate" : "Paste the API token from your CourtListener profile"} /><button type="button" className="text-button" aria-label={`${show ? "Hide" : "Show"} CourtListener token`} onClick={() => setShow((value) => !value)}>{show ? "Hide" : "Show"}</button></div>
          <p className="privacy-note"><ShieldCheck size={15} />The token is validated using the read-only <code>get_api_usage</code> MCP tool, encrypted with AES-256-GCM, and never returned to the browser or written to logs.</p>
          {!status?.tls && <div className="banner warn"><AlertTriangle size={17} />Token submission is disabled over plain HTTP in production. Use the installed HTTPS LAN URL.</div>}
          <div className="button-row"><button className="primary" disabled={busy || !token.trim()}>{busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}{status?.credentialConfigured ? "Validate and rotate token" : "Validate and connect"}</button>{status?.credentialConfigured && <button type="button" className="danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16} />Remove credential</button>}</div>
        </form>
      </section>
      <LegalAiSettings status={status?.legalAi ?? null} reload={reload} />
      <PasswordSettings />
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Private-network deployment</span><h2>Service access</h2></div><Network size={19} /></div><div className="url-list">{status?.lanUrls.map((url) => <code key={url}>{url}</code>) || <span>Private-network URLs will appear after the service starts.</span>}</div><p className="muted">Use host firewall rules, dashboard authentication, and trusted HTTPS certificates to limit access to authorized users.</p></section>
    </>
  );
}

function LegalAiSettings({ status, reload }: { status: LegalAiStatus | null; reload: () => void }) {
  const notify = useNotice();
  const [provider, setProvider] = useState<"ollama" | "openai" | "anthropic">(status?.provider ?? "ollama");
  const [baseUrl, setBaseUrl] = useState(status?.baseUrl ?? "http://127.0.0.1:11434");
  const [model, setModel] = useState(status?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!status?.configured) return;
    if (status.provider) setProvider(status.provider);
    if (status.baseUrl) setBaseUrl(status.baseUrl);
    if (status.model) setModel(status.model);
  }, [status?.configured, status?.provider, status?.baseUrl, status?.model]);
  function changeProvider(value: "ollama" | "openai" | "anthropic") {
    setProvider(value);
    setBaseUrl(value === "ollama" ? "http://127.0.0.1:11434" : value === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1");
    setModel(value === "anthropic" ? "claude-sonnet-4-5" : value === "openai" ? "gpt-5-mini" : "");
    setApiKey("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await put<LegalAiStatus>("/api/connections/legal-ai", { provider, baseUrl, model, apiKey });
      setApiKey(""); setShow(false); reload();
      notify({ kind: "success", message: "Legal AI provider validated and connected" });
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm("Remove the legal AI provider configuration? Existing generated analyses remain available, but no new analysis can run.")) return;
    setBusy(true);
    try {
      await del("/api/connections/legal-ai", { confirm: "REMOVE" }); reload();
      notify({ kind: "success", message: "Legal AI provider configuration removed" });
    } catch (reason) { notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusy(false); }
  }
  const statusLabel = status?.configured ? status.available ? "Connected" : status.lastError ? "Needs attention" : "Configured" : "Not configured";
  return <section className="connection-panel panel ai-settings" id="legal-ai">
    <div className="connection-hero"><div className="connection-logo ai-logo"><Sparkles size={25} /></div><div><span className="eyebrow">Optional grounded analysis layer</span><h2>Legal AI Connection</h2><p>Used only after CourtListener retrieves the authoritative opinion.</p></div><StatusPill status={statusLabel} /></div>
    <div className="connection-details"><div><small>Provider</small><strong>{status?.provider ? humanize(status.provider) : "Not selected"}</strong></div><div><small>Model</small><strong>{status?.model || "Not selected"}</strong></div><div><small>Endpoint</small><strong>{status?.baseUrl || "Backend only"}</strong></div><div><small>Last check</small><strong>{status?.lastCheckedAt ? formatDate(status.lastCheckedAt) : "Never"}</strong></div></div>
    {status?.lastError && <div className="banner error"><AlertTriangle size={16} />{status.lastError}</div>}
    <form className="ai-config-form" onSubmit={save}>
      <label>Provider<select value={provider} onChange={(event) => changeProvider(event.target.value as "ollama" | "openai" | "anthropic")}><option value="ollama">Ollama / local compatible</option><option value="openai">OpenAI-compatible API</option><option value="anthropic">Anthropic API</option></select></label>
      <label>Backend endpoint<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} placeholder="https://api.openai.com/v1" /></label>
      <label>Model<input value={model} onChange={(event) => setModel(event.target.value)} spellCheck={false} placeholder={provider === "ollama" ? "Local or Ollama cloud model name" : "Provider model name"} /></label>
      <label htmlFor="legal-ai-api-key">{provider === "ollama" ? "API key (only if required)" : "API key"}</label><div className="secret-input"><input id="legal-ai-api-key" type={show ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder={status?.configured && status.provider === provider ? "Leave blank to keep the encrypted key" : "Paste provider key"} /><button type="button" className="text-button" aria-label={`${show ? "Hide" : "Show"} legal AI key`} onClick={() => setShow((value) => !value)}>{show ? "Hide" : "Show"}</button></div>
      <div className="ai-data-notice"><ShieldCheck size={17} /><p><strong>Grounding and privacy boundary</strong> Opinion text retrieved from CourtListener is sent to this configured provider for analysis. Keys stay backend-only and encrypted with AES-256-GCM. No docket filing or private material is sent by this feature. Use only a provider approved for your practice.</p></div>
      <div className="button-row"><button className="primary" disabled={busy || !model.trim() || !baseUrl.trim() || (provider !== "ollama" && !apiKey.trim() && !(status?.configured && status.provider === provider))}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{status?.configured ? "Validate and update" : "Validate and connect"}</button>{status?.configured && <button type="button" className="danger" disabled={busy} onClick={() => void remove()}><Trash2 size={16} />Remove AI connection</button>}</div>
    </form>
  </section>;
}

function PasswordSettings() {
  const notify = useNotice();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const strength = [newPassword.length >= 14, /[a-z]/.test(newPassword), /[A-Z]/.test(newPassword), /\d/.test(newPassword), /[^A-Za-z0-9]/.test(newPassword)].filter(Boolean).length;
  const matches = Boolean(confirmation) && newPassword === confirmation;
  async function change(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await put<{ ok: boolean }>("/api/auth/password", { currentPassword, newPassword, confirmation });
      setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      notify({ kind: "success", message: "Dashboard password changed. Other sessions were signed out." });
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    } finally { setBusy(false); }
  }
  return <section className="panel password-panel">
    <div className="panel-heading"><div><span className="eyebrow">Dashboard security</span><h2>Change administrator password</h2></div><KeyRound size={19} /></div>
    <form className="password-form" onSubmit={change}>
      <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
      <label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-describedby="password-guidance" /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /><small className={`field-note ${confirmation ? matches ? "valid" : "invalid" : ""}`}>{confirmation ? matches ? "Passwords match" : "Passwords do not match" : "Re-enter the new password"}</small></label>
      <div className="password-guidance" id="password-guidance"><div className="strength-track">{[1, 2, 3, 4, 5].map((step) => <i className={strength >= step ? "filled" : ""} key={step} />)}</div><p>Use at least 14 characters and three of: lowercase, uppercase, numbers, and symbols. Avoid predictable product names or common passwords.</p></div>
      <button className="primary" disabled={busy || !currentPassword || strength < 4 || !matches}>{busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}Change password</button>
    </form>
  </section>;
}

function SavedPage() {
  const notify = useNotice();
  const { data, error, loading, reload } = useLoad(() => api<{ saved: SavedResearch[] }>("/api/saved"));
  async function remove(id: number) {
    try {
      await del(`/api/saved/${id}`); notify({ kind: "success", message: "Saved research removed" }); reload();
    } catch (reason) {
      notify({ kind: "error", message: reason instanceof Error ? reason.message : String(reason) });
    }
  }
  return (
    <>
      <PageHeader eyebrow="Research library" title="Saved Research" description="A local index of authorities and records you deliberately saved. CourtListener remains the grounding source." />
      {error && <div className="banner error"><AlertTriangle size={17} />{error}<button className="secondary compact" onClick={reload}><RefreshCw size={14} />Try again</button></div>}
      {loading ? <Loading /> : error && !data ? null : data?.saved.length ? <div className="saved-grid">{data.saved.map((item) => <article key={item.id}><span className="collection-badge">{item.kind}</span><h3>{item.title}</h3><p>{item.subtitle || "Saved CourtListener record"}</p><footer><span>{formatDate(item.createdAt)}</span><div>{item.courtlistenerUrl && <a className="icon-button" href={item.courtlistenerUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.title} on CourtListener`}><ExternalLink size={16} /></a>}<button className="danger-icon" onClick={() => void remove(item.id)} aria-label={`Remove ${item.title} from saved research`}><Trash2 size={16} /></button></div></footer></article>)}</div> : <EmptyState icon={<Bookmark />} title="No saved research" detail="Use the bookmark action on search results to build a focused local research collection." />}
    </>
  );
}

function AppRoutes() {
  return <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/research" element={<ResearchPage />} />
    <Route path="/semantic" element={<SemanticSearchPage />} />
    <Route path="/cases" element={<FocusedSearchPage mode="cases" />} />
    <Route path="/cases/:clusterId" element={<CaseWorkspace />} />
    <Route path="/dockets" element={<FocusedSearchPage mode="dockets" />} />
    <Route path="/dockets/:docketId" element={<DocketWorkspace />} />
    <Route path="/documents/:kind/:id" element={<DocumentReader />} />
    <Route path="/citations" element={<CitationsPage />} />
    <Route path="/verify" element={<CitationVerification />} />
    <Route path="/oral-arguments" element={<FocusedSearchPage mode="oral" />} />
    <Route path="/oral-arguments/:audioId" element={<OralArgumentWorkspace />} />
    <Route path="/judges" element={<FocusedSearchPage mode="judges" />} />
    <Route path="/judges/:personId" element={<JudgeWorkspace />} />
    <Route path="/disclosures" element={<DisclosuresPage />} />
    <Route path="/disclosures/:disclosureId" element={<DisclosureWorkspace />} />
    <Route path="/alerts" element={<AlertsPage />} />
    <Route path="/saved" element={<SavedPage />} />
    <Route path="/mcp" element={<McpConsole />} />
    <Route path="/api-explorer" element={<ApiExplorer />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export default function App() {
  const [auth, setAuth] = useState<"loading" | "yes" | "no">("loading");
  const [notices, setNotices] = useState<Array<Notice & { id: number }>>([]);
  const nextNotice = useRef(1);
  useEffect(() => {
    api<{ authenticated: boolean; csrfToken: string | null }>("/api/auth/status")
      .then((result) => { setCsrf(result.csrfToken); setAuth(result.authenticated ? "yes" : "no"); })
      .catch(() => setAuth("no"));
  }, []);
  const notify = useCallback((notice: Notice) => {
    const id = nextNotice.current++;
    setNotices((items) => [...items, { ...notice, id }]);
    window.setTimeout(() => setNotices((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);
  async function logout() {
    try { await post("/api/auth/logout", {}); } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        notify({ kind: "error", message: error instanceof Error ? error.message : "Sign out failed" });
        return;
      }
    }
    setCsrf(null); setAuth("no");
  }
  if (auth === "loading") return <main className="splash"><div className="brand-mark large"><Scale size={28} /></div><LoaderCircle className="spin" /></main>;
  if (auth === "no") return <Login onLogin={() => setAuth("yes")} />;
  return (
    <NoticeContext.Provider value={notify}>
      <Layout onLogout={() => void logout()}><AppRoutes /></Layout>
      <div className="notice-stack">{notices.map((notice) => <div className={`notice ${notice.kind}`} key={notice.id}>{notice.kind === "success" ? <Check size={17} /> : notice.kind === "error" ? <AlertTriangle size={17} /> : <Activity size={17} />}<span>{notice.message}</span><button onClick={() => setNotices((items) => items.filter((item) => item.id !== notice.id))}><X size={15} /></button></div>)}</div>
    </NoticeContext.Provider>
  );
}
