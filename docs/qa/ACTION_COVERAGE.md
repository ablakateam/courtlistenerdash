# Browser action coverage ledger

Last reviewed: 2026-09-20

This ledger tracks visible user actions separately from route availability. A
route is not considered complete merely because its heading renders.

Status meanings:

- **Accepted** — exercised through the production UI against deterministic
  CourtListener-shaped data.
- **Backend accepted** — server behavior has automated coverage; additional UI
  interaction may remain.
- **Live accepted** — observed against the hosted CourtListener service.
- **Open** — visible and implemented, but this exact interaction still needs
  browser acceptance.
- **Configuration blocked** — requires an approved optional provider that is
  not configured in the test environment.

| Area | Visible action or state | Status | Evidence / remaining work |
|---|---|---|---|
| Authentication | Sign in, sign out, sign back in | Accepted | Correct and replacement passwords exercised in the fixture browser. |
| Authentication | Wrong password and login throttling | Backend accepted | Security implementation and password verification covered; dedicated browser failure assertion remains open. |
| Dashboard | Usage allowance, connection state, recent activity | Accepted | Desktop and mobile browser assertions plus accessibility checks. |
| Dashboard | Search start and suggested query | Partial | Global search start accepted; suggested-query button and status refresh remain open. |
| Navigation | Every top-level route | Accepted | All 14 top-level destinations render; unknown routes return to Dashboard. |
| Navigation | Mobile menu and sidebar collapse | Partial | Mobile menu accepted; desktop collapse remains open. |
| Global Search | Automatic multi-collection search | Accepted | Successful tabs and temporary-unavailability retry accepted. |
| Legal Research | Keyword, exact citation, court choice, focused collection | Accepted | Includes CourtListener-provided court code and locked collection pages. |
| Legal Research | Save authority, remove authority, continue results | Accepted | Includes local-storage failure notice and no stale success. |
| Legal Research | Save entire search | Open | Implemented with visible error recovery; browser click remains open. |
| Semantic Search | Intent choice and grounded result context | Accepted | Similar-facts intent and CourtListener-only grounding accepted. |
| Case workspace | Overview, opinion, opinion find, parties, cited authorities | Accepted | Known *Brown* fixture and exact citation. |
| Case workspace | Save/copy/print/PDF toolbar | Partial | Save/copy errors now recover visibly; clipboard, print, and PDF browser behaviors remain open. |
| Case workspace | Docket, documents, citing, related, oral, raw tabs | Partial | Equivalent dedicated workspaces pass; each embedded case tab remains open. |
| AI case analysis | Disabled/fail-closed state | Accepted | No provider means no analysis can be invented. |
| AI case analysis | Long-document analysis, grounded questions, regeneration | Configuration blocked | Requires a practice-approved provider and model-quality evaluation. |
| Page-aware assistant | Persistent launcher, page explanation, grounded answer, follow-up, exact source | Live + fixture accepted | Ollama answered a public case excerpt with a verified passage; deterministic browser covers conversation and source presentation. |
| Page-aware assistant | Live page index, visible action inventory, trusted navigation, relevant-passage retrieval | Accepted | Unit coverage proves navigation questions retrieve available controls from a large page; browser acceptance proves the live index and action context are present. |
| Page-aware assistant | Protected Settings, console, alert, saved, and RECAP contexts | Accepted | Backend unit test and browser assertion prove protected page text is not included in the provider request. |
| Page-aware assistant | Mobile panel and WCAG review | Accepted | Responsive panel is included in the six-workflow serious/critical accessibility gate. |
| PACER / RECAP | Overview and chronological timeline | Live + fixture accepted | Known live docket and deterministic regression. |
| PACER / RECAP | Documents, parties, attorneys, oral records | Accepted | Lazy-loaded tabs and internal document route exercised. |
| PACER / RECAP | Pray and Pay / withdraw | Backend accepted | Confirmation binding is automated; cancel/confirmed fixture browser paths remain open. |
| Document reader | Read and search within a RECAP filing | Accepted | Correct internal routing and matched passage exercised. |
| Document reader | Previous/next chunk and print | Open | Controls are implemented; multi-chunk fixture and print event remain open. |
| Citation network | Build graph and open cited/citing opinions | Accepted | Graph and two navigable authority lists exercised. |
| Citation verification | Verified authority | Accepted | Source case and CourtListener record links are present. |
| Citation verification | Ambiguous, not found, mismatch, unresolved | Accepted | Official formatted MCP report shapes exercised. |
| Citation verification | Pending and resume | Accepted | Resumable job and newly verified authority exercised. |
| Citation verification | Extract-only mode | Open | Tool is exposed; separate browser presentation remains open. |
| Oral arguments | Detail, secure source, player, transcript find | Accepted | HTTPS media URL, fallback controls, and transcript matching exercised; audible live playback remains open. |
| Judges | Profile, appointments, education, affiliations, disclosures | Accepted | Known Sonia Sotomayor profile and empty affiliation state exercised. |
| Judges | Raw metadata and disclosure navigation link | Open | Data is visible; final clicks remain open. |
| Financial disclosures | Judge discovery and recent-report browsing | Partial | Person-linked records and report route pass; both discovery entry buttons remain open. |
| Financial disclosures | Overview, investment, debt-empty state, source PDF | Partial | Categories and source control render; remaining extracted categories and PDF navigation remain open. |
| Alerts | List, create, confirmation, delete, history | Accepted | Fixture account mutation is ephemeral and confirmation-gated. |
| Alerts | Docket subscribe/unsubscribe and alert cancellation | Backend accepted | Challenge protections pass; explicit fixture browser actions remain open. |
| MCP Console | Inventory, schema, read-only call, error cleanup | Accepted | All 19 tools listed; malformed JSON removes stale response. |
| MCP Console | Each read-only tool with valid and invalid inputs | Open | Inventory and representative call pass; exhaustive input matrix remains open. |
| API Explorer | Schema, successful call, malformed JSON | Accepted | Stale 200 state is removed on invalid input. |
| API Explorer | Every listed endpoint | Open | Known live endpoints sampled; endpoint-by-endpoint matrix remains open. |
| Settings | CourtListener token show, rotate, remove | Accepted | Temporary fixture secret only; browser never receives the stored secret. |
| Settings | Legal AI insecure-endpoint rejection | Accepted | Non-loopback HTTP configuration fails before any provider request. |
| Settings | Ollama Cloud/local catalog and model selection | Live + fixture accepted | Paid cloud catalog/chat smoke test passed; deterministic browser selects a returned cloud model without exposing a real key. |
| Settings | Legal AI successful connection/removal | Backend live accepted | Paid Ollama catalog/chat and encrypted configuration paths pass; final deployed browser save/removal remains open. |
| Settings | Password strength, change, session continuity | Accepted | Strong replacement, other-session revocation path, sign-out, and reauthentication pass. |
| Failure UX | Seven CourtListener error categories | Backend accepted | Invalid request, authentication, rate limit, timeout, missing record, unavailable, and generic failure mappings are automated. |
| Accessibility | Representative desktop/mobile WCAG checks | Accepted | No serious or critical findings in the current six-workflow suite, including the assistant on desktop and mobile. |

The open rows are the next browser-hardening queue. Live account-changing tools
will not be exercised merely to turn a table green; fixture confirmation and
backend challenge tests remain the default evidence unless a controlled live
mutation has an independent research purpose.
