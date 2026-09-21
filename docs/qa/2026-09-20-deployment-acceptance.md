# Deployment acceptance — 2026-09-20

Status: **Accepted for continued private LAN evaluation**

Revision: Public-release candidate

Scope: Standalone CourtListenerDash application and its documented deployment
resources.

## Release gate

The exact Git revision was pushed only after these checks passed:

- TypeScript validation
- 17 backend, security, URL, MCP-client, and legal-analysis tests
- Production frontend build
- Dependency audit with no known production vulnerability
- Deterministic browser acceptance across the main attorney workflow
- Desktop and mobile serious/critical accessibility checks
- GitHub Actions application and container jobs

## Host acceptance

The supported installer completed and restarted only
`courtlistener-web.service`. The first private-network request landed during the
restart window and was refused, so it was not treated as acceptance evidence.
The listeners and route were then checked again.

| Check | Observed result | Status |
|---|---|---|
| CourtListenerDash service | Active and enabled | Passed |
| Application listener | `0.0.0.0:8788` | Passed |
| LAN HTTPS listener | nginx on `0.0.0.0:443` and `[::]:443` | Passed |
| Loopback health | Healthy, version 1.2.0 | Passed |
| Private-network health | `https://<LAN-HOST>/healthz` returned healthy | Passed |
| Private-network dashboard | HTTP 200 through nginx with security headers | Passed |
| Accepted frontend | Validation host served the accepted local build | Passed |

## What this acceptance means

The revision is available on the private LAN and is suitable for the next QA
cycle. It includes structured official-format citation verification, focused
collection searches, navigable citation and RECAP-document routes, explicit
secondary-action failure recovery, stale-response prevention, token/password
administration acceptance, seven CourtListener error categories, and the
action-level coverage ledger. It does not close the product-hardening milestone.
Remaining live checks are intentionally paced around CourtListener's account
allowance and include continued-result pagination, selected read-only tool edge
cases, complete oral playback, and disclosure source-document presentation.

The quota-free browser suite remains the primary regression gate, so ordinary
UI and workflow testing does not consume the connected CourtListener account.

## Ollama Cloud follow-up acceptance

Revision `1cf59d6` added the optional paid Ollama Cloud connection and live
model selector. It passed the complete local and GitHub verification gates
before installation. The validation host then produced this evidence:

| Check | Observed result | Status |
|---|---|---|
| Official Ollama Cloud catalog | Authenticated direct API returned 20 selectable models | Passed |
| Application-equivalent provider validation | `gemma4:31b` returned the required JSON readiness response | Passed |
| Encrypted application configuration | Provider key stored in the dedicated data directory as a 0600 AES-256-GCM envelope | Passed |
| Installed model discovery | Decrypted backend configuration returned 20 cloud models and no key in the catalog response | Passed |
| Regression gate | 18 server/security tests and all five browser workflows passed | Passed |
| Deployment isolation | Only the standalone dashboard service restarted; the separately running Ollama service remained active | Passed |
| Private-network availability | Loopback and all configured private-network HTTPS paths returned healthy responses | Passed |

The local Ollama service also demonstrated why the connection paths remain
separate: its catalog retained cloud shortcut names while inference returned an
authentication error. The direct Cloud credential succeeded. A displayed
model name is therefore not treated as proof of usable inference; the selected
endpoint and model must pass validation together before the application saves
them.

## Page-aware legal assistant follow-up acceptance

Revision `2432fed` added the persistent, page-aware Legal Research Assistant.
The assistant is an optional analysis layer: CourtListener remains the source
of legal records, and the configured provider receives page material only when
the researcher submits a question.

| Check | Observed result | Status |
|---|---|---|
| Persistent interface | The accepted browser bundle contains the assistant launcher and panel on authenticated application pages | Passed |
| Current-page grounding | Answers expose verified source references derived from the submitted page snapshot, not model-authored quotation text | Passed |
| Protected pages | Settings, MCP Console, API Explorer, alerts, saved research, and RECAP-document routes discard captured body text server-side | Passed |
| Complete-opinion boundary | The interface distinguishes current-page help from the separate complete-opinion analysis workflow | Passed |
| Live provider behavior | The configured `gemma4:31b` model answered a known-opinion prompt with an accurate holding, an exact source excerpt, and a snapshot-scope caveat | Passed |
| Paid-call protection | Each authenticated session permits only one active assistant request | Passed |
| Encrypted configuration | The existing provider configuration survived installation as a service-owned 0600 encrypted envelope | Passed |
| Automated regression gate | 21 server/security tests and all six browser workflows passed | Passed |
| Accessibility | Desktop and mobile scans found no serious or critical issues after contrast corrections | Passed |
| GitHub verification | Application verification and container jobs passed for the exact feature revision | Passed |
| Installed artifacts | The deployed server contains the assistant module and serves the accepted assistant-enabled frontend bundle | Passed |
| Service isolation | The standalone dashboard restarted cleanly while the separately running Ollama service remained active | Passed |
| Private-network availability | Loopback and all configured private-network HTTPS health paths returned HTTP 200 | Passed |

The assistant excludes form values, raw technical payloads, hidden content, and
its own conversation from browser capture. Safe visible control labels may be
indexed for orientation without their values or external destinations. Public
case, docket, oral argument, judge, and disclosure information may be used when
it is visibly rendered, but filing text from RECAP document pages is not
captured. The UI discloses this boundary before a question is sent and links
source references back to visible page content where possible.

## Live page-RAG follow-up acceptance

Revision `4d08366` upgraded the assistant from a flat current-page snapshot to
an ephemeral retrieval layer over the rendered research view. The first local
health probe during installation reached the ordinary restart window and was
refused; it was not counted as acceptance evidence. All checks below were made
after the service reported healthy.

| Check | Observed result | Status |
|---|---|---|
| Live page index | The accepted browser identifies rendered text blocks plus visible button, tab, link, and field labels without collecting field values | Passed |
| Dynamic refresh | The in-memory index watches loaded-content and relevant control-state changes and rebuilds when the route changes | Passed |
| Relevant-passage retrieval | A large-page regression retrieves navigation actions and question-relevant neighboring passages instead of sending the complete page indiscriminately | Passed |
| Trusted navigation | Server-reviewed destinations remain available on every route, including privacy-protected workspaces, without capturing the application shell | Passed |
| Human action boundary | Suggested internal links require selection; other controls can be located and focused but are never autonomously activated | Passed |
| Live model behavior | `gemma4:31b` joined a visible “Open full opinion” action and displayed holding using two exact indexed sources, retained the current-page caveat, and returned no credential | Passed |
| Protected workspaces | Backend-enforced protected routes continue to discard submitted body context; the navigation map contains no user data | Passed |
| Automated regression gate | 22 server/security tests and all six browser workflows passed | Passed |
| GitHub verification | Type checks, tests, browser acceptance, production audit, and container build passed for the exact feature revision | Passed |
| Documentation | README includes a plain-language explanation, limitations, and a browser-generated live-index screenshot | Passed |
| Installed artifacts | The served bundle contains the live index and retrieval-coverage UI; the deployed backend contains `live_page_rag` retrieval and trusted navigation | Passed |
| Encrypted configuration | Existing provider configuration survived installation as a service-owned 0600 encrypted envelope | Passed |
| Service isolation | The dashboard restarted cleanly while the separate Ollama service remained active | Passed |
| Private-network availability | Loopback and all configured private-network HTTPS health paths returned HTTP 200 after restart | Passed |

The page index exists only in browser memory and provider traffic begins only
after an explicit question. It is not pixel-based screen capture, it does not
read content that has not been rendered, and it does not replace the complete-
opinion analysis pipeline.

## UI readability and cross-browser follow-up acceptance

Version **1.4.0** introduced the shared legal-reading scale, persistent text-
size control, larger interaction targets, bounded long-form reading measure,
responsive header organization, and the cross-engine acceptance project.

| Check | Observed result | Status |
|---|---|---|
| Backend regression | 24 server/security tests passed | Passed |
| Browser regression | Six complete Chromium product workflows passed | Passed |
| Cross-engine interface | Responsive/readability audit passed in Chromium, Firefox, and WebKit | Passed |
| Viewport coverage | 1440×900, 1024×768, 768×1024, and 390×844 | Passed |
| Enlarged phone layout | Extra-large 20px root scale persisted after reload without page-level overflow | Passed |
| Automated WCAG gate | No serious or critical findings on the enlarged phone case workspace | Passed |
| Dependency audit | No known production vulnerability | Passed |
| Installed service | `courtlistener-web.service` active and serving version 1.4.0 | Passed |
| HTTPS proxy | nginx active on IPv4 and IPv6 port 443 with CSP and HSTS | Passed |
| Private-network health | Loopback and all three configured LAN interfaces returned HTTP 200 and version 1.4.0 | Passed |

The installer's first native HTTPS health attempt landed during the ordinary
restart window and was refused; its built-in retry then completed. Independent
post-restart validation used the supported nginx HTTPS route on loopback and
each private-network interface. No unrelated application service was changed.
