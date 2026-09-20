# Security model

- The application runs as a dedicated service with its own Unix account, data
  directory, port, and systemd unit.
- LAN access requires the dashboard administrator password. Sessions use a
  signed, HTTP-only, same-site cookie and a separate CSRF token.
- The administrator password is stored only as a salted scrypt hash. Changing
  it requires the current password and invalidates every other active session.
- The deployment uses HTTPS with a locally generated certificate. Production
  token setup is rejected over plain HTTP.
- The CourtListener API token is submitted only to the backend, validated with
  the read-only `get_api_usage` MCP tool, and encrypted at rest with
  AES-256-GCM. The encryption key is kept in a root-owned systemd environment
  file. The saved token is never returned by an API response.
- Optional legal-AI provider configuration and API keys are also submitted only
  to the backend and encrypted at rest with AES-256-GCM. The browser receives
  only provider, model, endpoint, and status metadata—never the key.
- Ollama model discovery is performed by the backend. The browser receives a
  sanitized model name and non-sensitive model metadata, not the authorization
  header. A saved provider key is reused only when both provider and endpoint
  still match, so changing the destination cannot forward the old credential.
- Request diagnostics redact token, authorization, password, secret, and
  credential fields. Raw MCP calls are held in process memory for the MCP
  Console and disappear on restart. They are not written to SQLite.
- Search and read operations are allowed after authentication. The six known
  account-changing MCP tools require a short-lived, session-bound challenge
  tied to the exact tool and argument hash, followed by explicit browser
  confirmation.
- `call_endpoint` is used only for the MCP server's read-only list operation.
  The API Explorer does not expose arbitrary HTTP methods.
- UFW deployment rules allow the application port only from configured private
  LAN CIDRs. There is no public-internet allow rule.

## Data handling

Saved research stores only records the authenticated user explicitly bookmarks.
Activity records contain short summaries, not raw MCP responses. Citation text
and document searches may be sent to the hosted CourtListener MCP server; the
UI warns users to submit public text or citations unless disclosure is
authorized.

Case analysis sends the complete public CourtListener opinion text only to the
AI provider deliberately selected in Settings. It does not send docket filings,
user uploads, saved research, or private matter data. Opinion text is treated
as untrusted input. Model output is structurally validated, conclusions without
a valid source-paragraph ID are discarded, and displayed evidence excerpts are
copied from the CourtListener response rather than accepted from the model.
Selecting Ollama Cloud therefore sends the public opinion text to Ollama's
hosted API; selecting local Ollama keeps that provider hop on the configured
server unless the chosen local model is itself a cloud shortcut.

While its panel is open, the page-aware assistant maintains a temporary in-
memory index of allowed current-page text and safe labels for visible buttons,
tabs, and links. The provider receives nothing until the authenticated user
submits a question; the backend sends only the passages retrieved for that
question. This may include a visible research query as well as public
CourtListener data. Input and textarea values, hidden content, raw technical
JSON, and the assistant itself are not captured. Same-origin link paths may be
indexed, but external URLs and query strings are not. The model can describe
or suggest a visible control but cannot activate it.

Settings, MCP/API diagnostics, alerts, saved research, and RECAP filing text
are protected workspaces whose page bodies are never included. The backend
independently enforces that route policy instead of trusting the browser flag.
Model answers must cite a backend-assigned paragraph ID; invalid sources are
discarded and displayed excerpts are copied from the submitted page text.
Conversation history helps interpret follow-ups but is not evidence. The live
index is rebuilt on navigation and is not persisted as browsing history.

Public search questions can still reveal a legal strategy, and users can type
sensitive text into any prompt. The UI therefore states when the question and
page snapshot will be sent. Deployments should use only a provider approved for
their practice and should not submit confidential client information without
authorization.

## Certificate trust

The default installer creates a private self-signed LAN certificate. Browsers
will warn until the certificate is trusted. Verify the certificate fingerprint
on the server before trusting it on a workstation. A certificate from an
internal CA can replace the generated files without changing the application.
