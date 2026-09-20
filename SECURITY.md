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

## Certificate trust

The default installer creates a private self-signed LAN certificate. Browsers
will warn until the certificate is trusted. Verify the certificate fingerprint
on the server before trusting it on a workstation. A certificate from an
internal CA can replace the generated files without changing the application.
