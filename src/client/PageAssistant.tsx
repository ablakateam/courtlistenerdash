import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  ChevronRight,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type {
  LegalAiStatus,
  PageAssistantAnswer,
  PageAssistantTurn,
  SourcePassage,
} from "../shared/types";
import { post } from "./api";

interface PageGuide {
  title: string;
  summary: string;
  prompts: string[];
  protected: boolean;
  links?: Array<{ to: string; label: string }>;
}

interface ConversationItem {
  role: "user" | "assistant";
  text: string;
  response?: PageAssistantAnswer;
}

interface VisiblePageAction {
  id: string;
  label: string;
  kind: "link" | "button" | "tab" | "control";
  target: string | null;
  section: string | null;
  disabled: boolean;
}

interface PageSnapshot {
  text: string;
  truncated: boolean;
  blockCount: number;
  actions: VisiblePageAction[];
  fingerprint: string;
}

const MAX_CONTEXT_CHARACTERS = 180_000;

function pageGuide(pathname: string): PageGuide {
  if (/^\/cases\/\d+/.test(pathname)) return { title: "Case workspace", summary: "I can explain the case material, analysis, citations, and research paths visible on this screen. Use Complete Opinion Analysis for a full-document brief.", prompts: ["Summarize what is visible on this page", "What holding and rule are shown here?", "What should I verify next?"], protected: false, links: [{ to: "/semantic", label: "Find related cases" }, { to: "/verify", label: "Verify a citation" }] };
  if (/^\/documents\/opinion\/\d+/.test(pathname)) return { title: "Opinion reader", summary: "I can summarize or explain the currently loaded opinion section and point back to exact page passages.", prompts: ["Summarize this loaded section", "Identify the important legal reasoning", "What limitations should I keep in mind?"], protected: false, links: [{ to: "/semantic", label: "Find related cases" }, { to: "/citations", label: "Open citation network" }] };
  if (/^\/documents\/recap\/\d+/.test(pathname)) return { title: "RECAP document reader", summary: "I can explain the reader and research workflow. Filing text stays outside the AI context under the current privacy boundary.", prompts: ["What can I do on this page?", "How do I search this filing?", "How do I verify document availability?"], protected: true };
  if (/^\/dockets\/\d+/.test(pathname)) return { title: "Docket workspace", summary: "I can outline visible public docket metadata and procedural activity, explain tabs, and suggest the next research step.", prompts: ["Outline the visible procedural activity", "What should I inspect next?", "Explain RECAP coverage on this page"], protected: false, links: [{ to: "/dockets", label: "New docket search" }, { to: "/alerts", label: "Manage monitoring" }] };
  if (/^\/oral-arguments\/\d+/.test(pathname)) return { title: "Oral argument", summary: "I can summarize the transcript currently shown, explain the record, and help connect the argument to its docket.", prompts: ["Summarize the visible transcript", "What issues appear in this argument?", "What should I verify in the opinion?"], protected: false };
  if (/^\/judges\/\d+/.test(pathname)) return { title: "Judicial profile", summary: "I can explain the visible public biography, appointments, education, affiliations, and disclosure links without inferring a conflict.", prompts: ["Summarize this profile", "Outline the appointment history shown", "What disclosure research is available?"], protected: false };
  if (/^\/disclosures\/\d+/.test(pathname)) return { title: "Financial disclosure", summary: "I can organize the visible public disclosure data factually. I will not infer a conflict from a listed asset or transaction.", prompts: ["Summarize the visible report data", "Which categories should I review?", "What can and cannot be concluded here?"], protected: false };
  const definitions: Record<string, PageGuide> = {
    "/": { title: "Research dashboard", summary: "I can explain the dashboard, connection and allowance indicators, and the fastest path into a legal research task.", prompts: ["What can I do on this page?", "Where should I start a case-law question?", "Explain the usage indicators"], protected: false, links: [{ to: "/research", label: "Start legal research" }, { to: "/semantic", label: "Ask a research question" }] },
    "/research": { title: "Legal Research", summary: "I can help interpret the loaded CourtListener results and explain the structured keyword and citation-search workflow.", prompts: ["Summarize these visible results", "Which result looks most relevant and why?", "Explain the available search filters"], protected: false, links: [{ to: "/semantic", label: "Switch to semantic search" }, { to: "/verify", label: "Verify citations" }] },
    "/semantic": { title: "Semantic Search", summary: "I can help preserve your legal research intent and explain why the visible CourtListener authorities may be relevant.", prompts: ["Explain these visible results", "How should I refine this research question?", "What should I verify before relying on a result?"], protected: false, links: [{ to: "/research", label: "Structured legal search" }, { to: "/saved", label: "Open saved research" }] },
    "/cases": { title: "Cases and Opinions", summary: "I can explain case-law search and help review the CourtListener results currently shown.", prompts: ["Summarize these search results", "How do I search an exact citation?", "What should I open first?"], protected: false },
    "/dockets": { title: "PACER / RECAP", summary: "I can explain federal docket search, public RECAP coverage, and the visible CourtListener results.", prompts: ["Summarize these docket results", "Explain RECAP versus PACER", "What should I open first?"], protected: false },
    "/citations": { title: "Citation Network", summary: "I can explain visible citation relationships while keeping clear that an edge is not positive or negative treatment.", prompts: ["Explain this citation network", "What does this relationship establish?", "What should I verify next?"], protected: false },
    "/verify": { title: "Citation Verification", summary: "I can explain CourtListener's visible citation-resolution states and discrepancies without calling a case good law.", prompts: ["Explain these verification results", "What does ambiguous mean here?", "What still needs attorney review?"], protected: false },
    "/oral-arguments": { title: "Oral Arguments", summary: "I can help interpret visible audio-search results and explain the recording and transcript workflow.", prompts: ["Summarize these visible results", "How do I find a transcript?", "How does this connect to a case?"], protected: false },
    "/judges": { title: "Judges", summary: "I can help interpret visible judicial search results and explain the profile and disclosure workflow.", prompts: ["Summarize these visible results", "What records are available for a judge?", "How do I find disclosures?"], protected: false },
    "/disclosures": { title: "Financial Disclosures", summary: "I can explain the public-record workflow and visible results without making conflict conclusions.", prompts: ["Explain this page", "How do I find a judge's reports?", "What can disclosure data establish?"], protected: false },
    "/settings": { title: "Settings", summary: "I can explain connection and security controls, but settings content and form data are never sent to the AI provider.", prompts: ["What can I configure here?", "How are credentials protected?", "How do I switch Ollama models?"], protected: true },
    "/mcp": { title: "MCP Console", summary: "I can explain the developer workflow, but tool parameters and raw responses are excluded from AI context.", prompts: ["What is the MCP Console for?", "How do I inspect a tool safely?", "Which actions change the account?"], protected: true },
    "/api-explorer": { title: "API Explorer", summary: "I can explain endpoint inspection, but request parameters and raw responses are excluded from AI context.", prompts: ["What is the API Explorer for?", "How is it different from research search?", "How do I inspect pagination?"], protected: true },
    "/alerts": { title: "Alerts", summary: "I can explain monitoring workflows, but alert names and queries are excluded from AI context.", prompts: ["Explain the alerts workflow", "Which alert types are available?", "Which actions need confirmation?"], protected: true },
    "/saved": { title: "Saved Research", summary: "I can explain the local research-library workflow, but saved items are excluded from AI context.", prompts: ["What is Saved Research for?", "How do I save an authority?", "Where does saved data live?"], protected: true },
  };
  return definitions[pathname] ?? { title: "Current research page", summary: "I can explain the current CourtListenerDash page using only the material shown here.", prompts: ["What can I do on this page?", "Summarize what is visible", "What should I verify next?"], protected: false };
}

function pageTitle(fallback: string): string {
  const heading = document.querySelector<HTMLElement>("main.content h1, main.content h2");
  return heading?.innerText.trim().slice(0, 300) || fallback;
}

function visible(element: HTMLElement): boolean {
  return element.offsetParent !== null && element.getAttribute("aria-hidden") !== "true";
}

function normalizedText(value: string | null | undefined, maximum = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function fingerprintText(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${value.length}:${hash >>> 0}`;
}

function elementLabel(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const explicit = element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder");
    if (explicit) return normalizedText(explicit, 220);
    const label = element.labels?.[0];
    const directText = label ? [...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join(" ") : "";
    return normalizedText(directText, 220);
  }
  return normalizedText(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title"), 220);
}

function actionSection(element: HTMLElement): string | null {
  const region = element.closest<HTMLElement>("section, article, [role='region'], main");
  const heading = region?.querySelector<HTMLElement>("h1, h2, h3, h4, [role='heading']");
  return normalizedText(heading?.innerText, 160) || null;
}

function actionTarget(element: HTMLElement): string | null {
  if (!(element instanceof HTMLAnchorElement)) return null;
  const raw = element.getAttribute("href");
  if (!raw || raw.startsWith("#")) return null;
  try {
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin || url.username || url.password) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function collectPageContext(protectedPage: boolean): PageSnapshot {
  if (protectedPage) return { text: "", truncated: false, blockCount: 0, actions: [], fingerprint: "protected" };
  const root = document.querySelector<HTMLElement>("main.content");
  if (!root) return { text: "", truncated: false, blockCount: 0, actions: [], fingerprint: "empty" };
  const selectors = "h1, h2, h3, h4, p, li, dt, dd, th, td, blockquote, pre, .banner, .status-pill, .collection-badge";
  const excluded = "form, [data-ai-private], .technical-view, .technical-details, .json-block, .legal-assistant";
  const values: string[] = [];
  const actions: VisiblePageAction[] = [];
  const seenActions = new Set<string>();
  for (const [index, element] of [...root.querySelectorAll<HTMLElement>("a[href], button, [role='button'], [role='tab'], summary, input:not([type='hidden']):not([type='password']), select, textarea")].entries()) {
    if (element.closest("[data-ai-private], .technical-view, .technical-details, .json-block, .legal-assistant") || !visible(element)) continue;
    const label = elementLabel(element);
    if (!label) continue;
    const role = element.getAttribute("role");
    const kind: VisiblePageAction["kind"] = element instanceof HTMLAnchorElement ? "link" : role === "tab" ? "tab" : element instanceof HTMLButtonElement ? "button" : "control";
    const target = actionTarget(element);
    const disabled = element.matches(":disabled, [aria-disabled='true']");
    const section = actionSection(element);
    const key = `${kind}|${label.toLowerCase()}|${target ?? ""}|${disabled}`;
    if (seenActions.has(key)) continue;
    seenActions.add(key);
    actions.push({ id: `A${index + 1}`, label, kind, target, section, disabled });
    if (actions.length >= 80) break;
  }
  const actionText = actions.length
    ? `AVAILABLE PAGE ACTIONS\n\n${actions.map((action) => `[ACTION ${action.id}] ${action.kind.charAt(0).toUpperCase()}${action.kind.slice(1)} "${action.label}"${action.target ? ` opens ${action.target}` : ""}${action.section ? ` in ${action.section}` : ""}${action.disabled ? " (currently disabled)" : ""}.`).join("\n\n")}`
    : "AVAILABLE PAGE ACTIONS\n\nNo visible page-specific actions were detected.";
  let length = actionText.length + 2;
  let truncated = false;
  for (const element of root.querySelectorAll<HTMLElement>(selectors)) {
    if (element.closest(excluded) || !visible(element)) continue;
    const value = normalizedText(element.innerText, 20_000);
    if (!value || value.length < 2 || values[values.length - 1] === value) continue;
    if (length + value.length + 2 > MAX_CONTEXT_CHARACTERS) {
      truncated = true;
      break;
    }
    values.push(value);
    length += value.length + 2;
  }
  const text = `${actionText}\n\nVISIBLE PAGE CONTENT\n\n${values.join("\n\n")}`;
  return { text, truncated, blockCount: values.length, actions, fingerprint: fingerprintText(text) };
}

function locatePageAction(label: string): void {
  const normalized = normalizedText(label).toLowerCase();
  if (!normalized) return;
  const elements = document.querySelectorAll<HTMLElement>("main.content a[href], main.content button, main.content [role='button'], main.content [role='tab'], main.content summary, main.content input:not([type='hidden']):not([type='password']), main.content select, main.content textarea");
  const target = [...elements].find((element) => elementLabel(element).toLowerCase() === normalized);
  if (!target) return;
  target.classList.add("assistant-source-focus");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.focus({ preventScroll: true });
  window.setTimeout(() => target.classList.remove("assistant-source-focus"), 3_500);
}

function locateSource(source: SourcePassage): void {
  const actionLabel = source.excerpt.match(/\[ACTION\s+A\d+\]\s+(?:Link|Button|Tab|Control)\s+"([^"]+)"/i)?.[1];
  if (actionLabel) {
    locatePageAction(actionLabel);
    return;
  }
  const needle = source.excerpt.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);
  if (!needle) return;
  const elements = document.querySelectorAll<HTMLElement>("main.content h1, main.content h2, main.content h3, main.content p, main.content li, main.content dd, main.content td, main.content blockquote, main.content pre, main.content .banner, main.content a, main.content button, main.content summary");
  const target = [...elements].find((element) => element.innerText.replace(/\s+/g, " ").trim().toLowerCase().includes(needle));
  if (!target) return;
  target.classList.add("assistant-source-focus");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target.classList.remove("assistant-source-focus"), 3_500);
}

function humanizeProvider(value: string | null): string {
  if (!value) return "AI";
  return value === "ollama" ? "Ollama" : value.charAt(0).toUpperCase() + value.slice(1);
}

export function PageAssistant({ aiStatus }: { aiStatus: LegalAiStatus | null }) {
  const location = useLocation();
  const guide = useMemo(() => pageGuide(location.pathname), [location.pathname]);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ConversationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conversationRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setMessages([]);
    setQuestion("");
    setError("");
    setSnapshot(null);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, busy, error]);
  useEffect(() => {
    if (!open) return;
    const root = document.querySelector<HTMLElement>("main.content");
    let timer: number | undefined;
    const refresh = () => {
      const next = collectPageContext(guide.protected);
      setSnapshot((current) => current?.fingerprint === next.fingerprint ? current : next);
    };
    refresh();
    if (!root || guide.protected) return;
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 180);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "aria-hidden", "href", "hidden"] });
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [open, guide]);

  async function ask(value: string) {
    const submitted = value.trim();
    if (!submitted || busy) return;
    const snapshot = collectPageContext(guide.protected);
    setSnapshot(snapshot);
    const title = pageTitle(guide.title);
    const history: PageAssistantTurn[] = messages.slice(-6).map((item) => ({ role: item.role, text: item.text }));
    setQuestion("");
    setError("");
    setMessages((items) => [...items, { role: "user", text: submitted }]);
    setBusy(true);
    try {
      const response = await post<PageAssistantAnswer>("/api/assistant/ask", {
        route: location.pathname,
        pageTitle: title,
        question: submitted,
        contextText: snapshot.text,
        contextTruncated: snapshot.truncated,
        history,
      });
      setMessages((items) => [...items, { role: "assistant", text: response.answer?.text || "The current page did not provide enough source material for a grounded answer.", response }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return <div className="legal-assistant" data-legal-assistant>
    {open && <section className="assistant-panel" role="dialog" aria-label="Page-aware legal research assistant">
      <header className="assistant-header">
        <div className="assistant-mark"><Sparkles size={18} /></div>
        <div><strong>Legal Research Assistant</strong><span>{guide.title} · {aiStatus?.model || "provider not configured"}</span></div>
        <button type="button" className="icon-button" aria-label="Close legal research assistant" onClick={() => setOpen(false)}><X size={18} /></button>
      </header>
      <div className={`assistant-context ${guide.protected ? "protected" : ""}`}>
        {guide.protected ? <ShieldCheck size={15} /> : <BookOpen size={15} />}
        <span><strong>{guide.protected ? "Privacy-protected guidance" : "Current-page context"}</strong>{guide.summary}</span>
      </div>
      <div className="assistant-conversation" ref={conversationRef} aria-live="polite">
        {!messages.length && <div className="assistant-welcome"><span className="eyebrow">Page-aware help</span><h3>How can I help with this screen?</h3><p>{guide.summary}</p>{!guide.protected && snapshot && <section className="assistant-page-map" aria-label="Live page index"><header><strong>Live page index</strong><span>{snapshot.blockCount} text blocks · {snapshot.actions.length} actions</span></header>{snapshot.actions.length ? <div>{snapshot.actions.slice(0, 6).map((action) => action.target && !action.disabled ? <Link key={action.id} to={action.target} onClick={() => setOpen(false)}>{action.label}<ChevronRight size={11} /></Link> : <button type="button" key={action.id} disabled={action.disabled} onClick={() => locatePageAction(action.label)}>{action.label}{!action.disabled && <ChevronRight size={11} />}</button>)}</div> : <small>The page has no visible page-specific controls yet.</small>}</section>}<div className="assistant-prompts">{guide.prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void ask(prompt)}>{prompt}<ChevronRight size={13} /></button>)}</div>{guide.links?.length ? <nav className="assistant-workflow-links" aria-label="Suggested research destinations">{guide.links.map((link) => <Link key={link.to} to={link.to} onClick={() => setOpen(false)}>{link.label}<ChevronRight size={12} /></Link>)}</nav> : null}</div>}
        {messages.map((message, index) => <article className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
          <span>{message.role === "user" ? "You" : "Assistant"}</span>
          <p>{message.text}</p>
          {message.response?.answer?.sources.length ? <div className="assistant-sources">{message.response.answer.sources.map((source) => {
            const guidance = /^(?:PAGE PURPOSE|CURRENT PAGE TITLE|TRUSTED PLATFORM NAVIGATION|No page body)/i.test(source.excerpt);
            const action = source.excerpt.match(/^\[ACTION\s+A\d+\]\s+(?:Link|Button|Tab|Control)\s+"([^"]+)"/i);
            const displayedExcerpt = action ? source.excerpt.replace(/^\[ACTION\s+A\d+\]\s+/i, "") : source.excerpt;
            return <details key={source.paragraph}><summary><BadgeCheck size={12} />{guidance ? "Platform guidance" : action ? `Page action: ${action[1]}` : `Page source ${source.paragraph}`}</summary><blockquote>{displayedExcerpt}</blockquote>{!guidance && <button type="button" className="text-button" onClick={() => locateSource(source)}>Locate on screen</button>}</details>;
          })}</div> : null}
          {message.response?.caveats.map((caveat) => <small key={caveat}><AlertTriangle size={12} />{caveat}</small>)}
          {message.response?.suggestedQuestions.length ? <div className="assistant-followups">{message.response.suggestedQuestions.map((prompt) => <button type="button" key={prompt} onClick={() => void ask(prompt)}>{prompt}</button>)}</div> : null}
          {message.response && <footer>{humanizeProvider(message.response.provider)} · {message.response.model} · current-page answer{message.response.context.retrievedPassages ? ` · ${message.response.context.retrievedPassages}/${message.response.context.indexedPassages} passages retrieved` : ""}</footer>}
        </article>)}
        {busy && <div className="assistant-thinking"><LoaderCircle className="spin" size={16} /><span>Reading the current page and checking source passages…</span></div>}
        {error && <div className="assistant-error"><AlertTriangle size={15} /><span>{error}</span></div>}
      </div>
      {aiStatus?.configured ? <form className="assistant-composer" onSubmit={submit}>
        <textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this page, case, result, or next research step…" aria-label="Ask the legal research assistant" />
        <button className="primary" disabled={busy || !question.trim()} aria-label="Send question">{busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
      </form> : <div className="assistant-setup"><span>Connect an approved AI provider to ask page-aware questions.</span><Link to="/settings#legal-ai" onClick={() => setOpen(false)}>Open Settings</Link></div>}
      <footer className="assistant-footer"><ShieldCheck size={12} />{guide.protected ? "Only your question and page-purpose guidance are sent" : "Your question and allowed current-page snapshot are sent"}{messages.length > 0 && <button type="button" onClick={() => { setMessages([]); setError(""); }}><RotateCcw size={12} />Clear</button>}</footer>
    </section>}
    <button type="button" className={`assistant-launcher ${open ? "active" : ""}`} aria-label={open ? "Close legal research assistant" : "Open legal research assistant"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? <X size={22} /> : <MessageSquareText size={23} />}
      {!open && <span>Ask AI</span>}
    </button>
  </div>;
}
