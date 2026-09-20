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

The data directory contains encrypted CourtListener and AI-provider
configuration, the administrator password hash, saved research, activity
history, and cached case analyses. Deployment secrets are supplied through
environment variables or mounted secret files. None belong in Git.

## Trust boundaries

- CourtListener determines which legal records and citations exist.
- CourtListener search snippets are research leads, not holdings.
- AI analysis is optional and fails closed when it cannot cite a retrieved
  source paragraph.
- RECAP coverage is useful but incomplete; it is not the same as direct PACER
  access.
- Financial-disclosure records are presented factually without inferring a
  conflict.
- A custom legal-AI endpoint is an administrator-selected trust boundary. Only
  authenticated settings users can configure it; remote endpoints must use
  HTTPS, and retrieved opinion text is sent there only when the user requests
  analysis. Deployments should use a provider approved for their practice.
