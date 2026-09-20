# MCP coverage matrix

The live matrix is available at **Developer → MCP Console → MCP tool coverage**.
It is produced by comparing the reviewed baseline with `tools/list` from the
connected official server.

| Tool | Implemented | Primary UI | Automated test | Live result |
|---|---:|---|---|---|
| search | Yes | Research and dataset modules | Adapter + browser | Live pass |
| get_endpoint_schema | Yes | API Explorer | Adapter | Live pass |
| call_endpoint | Yes | Workspaces and API Explorer | Adapter + browser | Live pass |
| get_endpoint_item | Yes | Detail workspaces | Adapter + browser | Live pass |
| get_choices | Yes | Search filters / API Explorer | Adapter + browser | Live pass |
| get_counts | Yes | MCP Console / pagination | Inventory + fixture browser | Expanded live audit pending quota reset |
| get_more_results | Yes | Ordinary search pagination / MCP Console | Route + fixture browser | Live continuation retest pending quota reset |
| read_document | Yes | Document reader | Adapter + fixture browser | Previously live-tested; expanded audit pending |
| search_document | Yes | Document reader | Adapter + fixture browser | Previously live-tested; expanded audit pending |
| extract_citations | Yes | Citation Verification | Adapter + fixture browser | Expanded live audit pending quota reset |
| analyze_citations | Yes | Structured Citation Verification workspace | Official-report parser + fixture browser | Expanded live audit pending quota reset |
| resume_citation_analysis | Yes | Citation Verification / MCP Console | Dynamic exposure | Tested when analysis returns a resumable job |
| create_search_alert | Yes | Alerts | Confirmation-gate test | Not mutation-tested by design |
| delete_search_alert | Yes | Alerts | Confirmation-gate test | Not mutation-tested by design |
| subscribe_to_docket_alert | Yes | Dockets / Alerts | Confirmation-gate test | Not mutation-tested by design |
| unsubscribe_from_docket_alert | Yes | Dockets / Alerts | Confirmation-gate test | Not mutation-tested by design |
| pray_for_document | Yes | Docket documents | Confirmation-gate test | Not mutation-tested by design |
| withdraw_prayer | Yes | Alerts / MCP Console | Confirmation-gate test | Not mutation-tested by design |
| get_api_usage | Yes | Dashboard / Settings | Credential validation + live/fixture browser | Live pass |

The connected official server exposed all 19 expected tools on 2026-09-19.
Known-record live checks passed for opinions, judges, financial disclosures,
oral argument metadata, a RECAP docket, docket entries, documents, parties,
attorneys, ordering choices, and endpoint schemas. The remaining expanded
read-only checks are intentionally deferred until the connected account's
hourly window resets. Account-changing tools are never invoked by an
unattended production smoke test.

The deterministic browser suite uses all 19 reviewed tool definitions and
CourtListener-shaped responses to protect UI routing and response mapping
without spending the live account allowance. Its citation fixture follows the
official MCP server's formatted-text report contract rather than substituting
a convenient JSON shape. A fixture pass is not recorded as a live integration
pass; the two evidence layers remain separate in this matrix.
