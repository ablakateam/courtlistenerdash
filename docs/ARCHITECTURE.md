# Architecture

## Product boundary

CourtListenerDash is a standalone web application with a dedicated process,
listener, credential boundary, and writable data directory. It can be deployed
independently through Docker Compose or as a systemd service.

## Request path

```text
Browser
  → authenticated CourtListenerDash backend
    → official CourtListener MCP server
      → CourtListener REST/search/document services
```

The browser never receives the CourtListener API token. The backend encrypts it
with AES-256-GCM and sends it only to the official MCP endpoint. The optional
legal-AI provider is a separate backend connection and never receives the
CourtListener credential.

```text
CourtListener semantic opinion results
  → independent Jev decision service
    → versioned typed relevance schema
      → encrypted-key provider call + bounded cache/audit store
        → shadow preview or experimental reranking
```

Jev receives only a research question, explicit intent, public CourtListener
metadata, and a bounded matched opinion passage. It does not generate legal
authority or prose. Its API key is encrypted separately, and provider failure
preserves the original CourtListener results. Decision records are keyed by
query, source-text hash, schema version, and pinned model so a taxonomy or
model change cannot silently reinterpret old results. See
[TypeSafe Jev legal-decision architecture](TYPESAFE_JEV_ARCHITECTURE.md).

```text
Authenticated browser page
  → ephemeral live index of visible text + safe action labels
    → explicit assistant question
      → server route policy + relevant-passage retrieval
        → configured legal-AI provider
          → source-ID validation
            → answer with exact page excerpts
```

Protected routes send only the question and fixed page-purpose guidance. The
backend applies the route policy again even if a browser submits page text.
The live index refreshes when the rendered research area changes, remains in
memory, and is rebuilt on navigation. It is not written to the application
database. Input values, hidden content, raw technical payloads, and the
assistant conversation are never indexed. Visible buttons and links are
descriptive context only; the model cannot activate a control or perform an
account-changing action.

## Research surfaces

The application intentionally has three search purposes:

| Surface | User need | Behavior |
|---|---|---|
| Global Search | “Check CourtListener broadly” | Searches supported collections and keeps record types in separate tabs. |
| Legal Research | “I know the kind of legal record I need” | Keyword search within one selected collection using only supported filters. |
| Semantic Search | “Find opinions with the same issue, facts, doctrine, procedure, or reasoning” | CourtListener semantic opinion retrieval with an explicit research intent. |

Collection pages are focused entrances to Legal Research, not additional search
systems. A result should lead into a stable workspace for the selected case,
docket, judge, disclosure, document, or oral argument.

## Quota-aware workspace loading

CourtListener account limits shape the interface. Composite records are loaded
progressively:

```text
Docket summary (one call)
  ├─ Timeline (on demand)
  ├─ RECAP documents (on demand)
  ├─ Parties (on demand)
  ├─ Attorneys (on demand)
  └─ Oral arguments (on demand)
```

This avoids spending the account’s minute allowance on information the user
has not asked to see. Read-only audit tooling also spaces upstream calls to the
connected account’s baseline rate.

## Persistence

The data directory contains encrypted CourtListener, TypeSafe, and AI-provider
configuration, the administrator password hash, saved research, activity
history, cached Jev decisions, and cached case analyses. Deployment secrets are supplied through
environment variables or mounted secret files. None belong in Git.

## Trust boundaries

- CourtListener determines which legal records and citations exist.
- CourtListener search snippets are research leads, not holdings.
- AI analysis is optional and fails closed when it cannot cite a retrieved
  source paragraph.
- Jev probabilities are versioned model inferences, not source facts or
  percentages of legal correctness. Search remains usable without Jev, and
  active behavior requires a pinned model plus an application-specific
  attorney-reviewed evaluation.
- RECAP coverage is useful but incomplete; it is not the same as direct PACER
  access.
- Financial-disclosure records are presented factually without inferring a
  conflict.
- A custom legal-AI endpoint is an administrator-selected trust boundary. Only
  authenticated settings users can configure it; remote endpoints must use
  HTTPS, and retrieved opinion text is sent there only when the user requests
  analysis. Deployments should use a provider approved for their practice.
- Ollama model discovery runs through the authenticated backend. Catalog
  responses are reduced to safe model metadata, while API keys remain in the
  encrypted server-side provider configuration. Credential reuse is bound to
  the exact provider and normalized endpoint.
- The page assistant is a current-screen aid, not a background recorder. It
  maintains a temporary index while open but sends retrieved content only on
  explicit submission. It labels truncated context, validates source IDs, and
  never substitutes for the complete-opinion analysis pipeline. Navigation
  questions also use a reviewed server-side route map so the surrounding shell
  does not need to be captured.
