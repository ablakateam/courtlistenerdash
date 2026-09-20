# CourtListener MCP tool inventory

Inventory date: 2026-09-19

Official source revision: `556ffa2f4582ebeb702b7e897363bc5ec7f5f19b` (2026-09-14)

Hosted endpoint: `https://mcp.courtlistener.com/`

The application discovers the live tool list and JSON Schemas at runtime. This
document is the reviewed baseline. If CourtListener adds a tool, it appears in
the MCP Console and coverage matrix even before a purpose-built screen is
added.

| MCP tool | Input schema summary | Output/data source | Web module and UI action | Error behavior | Mode |
|---|---|---|---|---|---|
| `search` | Required `type`; CourtListener search filters; `fields`; `num_results` 1–100. Types currently include opinions (`o`), RECAP (`r`), RECAP documents (`rd`), dockets (`d`), judges (`p`), and oral arguments (`oa`). Opinion search supports `semantic=true`. | Paginated Search API results with `query_id`, count, and opinion IDs when available. | Unified Research, Semantic Search, Cases, Dockets, Oral Arguments, Judges. | Validation errors are shown without credentials; empty results are not represented as proof of absence. | Read-only, idempotent |
| `get_endpoint_schema` | `endpoint_id` from the live endpoint enum. | Runtime JSON Schema generated from the CourtListener API client models. | API Explorer → Load schema. | Unsupported endpoints are rejected by MCP schema validation. | Read-only, idempotent |
| `call_endpoint` | `endpoint_id`, optional query object, `num_results` 1–100. | Read-only list access to every modeled REST resource; returns results, count, `query_id`, and pagination state. | All research workspaces and API Explorer. | API/filter errors remain attached to their workspace section; composite workspaces continue loading other sections. | Read-only, idempotent |
| `get_endpoint_item` | `endpoint_id`, string/integer `item_id`, optional `fields`. | One CourtListener resource. | Case, docket, judge, opinion, and disclosure detail workspaces. | Missing/invalid IDs become an explicit UI error. | Read-only, idempotent |
| `get_choices` | `endpoint_id`, `field_name`. | Valid fixed choices or related-object guidance for a filter. | MCP Console and API Explorer filter work. | Explains fields without fixed choices and suggests the related endpoint where appropriate. | Read-only, idempotent |
| `get_counts` | Previous `query_id`. | Deferred total for a stored query. | Search pagination and MCP Console. | Expired/unknown query IDs require rerunning the original query. | Read-only, idempotent |
| `get_more_results` | Previous `query_id`; `num_results` 1–100. | Next result page from the one-hour MCP session state. | Search pagination and MCP Console. | Expired query IDs require rerunning the query; “no more results” is displayed plainly. | Read-only, not idempotent with respect to cursor |
| `read_document` | Exactly one of `opinion_id`, `recap_document_id`, `cluster_id`; optional zero-based `chunk_index` or list (max 10); `chunk_size` ≥100. | Opinion `html_with_citations` or RECAP `plain_text`, chunk metadata, and cluster opinion IDs. | Opinion / RECAP document reader. | Unavailable text and out-of-range chunks are explicit; no document is fabricated. | Read-only, idempotent |
| `search_document` | Exactly one of opinion ID(s), RECAP document ID(s), or cluster ID; required literal `query`; optional `snippet_size`. Max 10 documents, 20 snippets per document. | Case-insensitive literal matches with positions and surrounding text. | Document reader → Search within document. | Per-document errors do not abort other document searches. | Read-only, idempotent |
| `extract_citations` | Required `text`; optional `resolve` (default true). | eyecite extraction/resolution performed on the MCP server; no CourtListener lookup. | Citation Verification → Extract only. | Returns “No citations found” when appropriate. | Read-only, idempotent |
| `analyze_citations` | Exactly one of `text`, `opinion_id`, or `cluster_id`. | eyecite plus CourtListener Citation Lookup API; canonical case metadata and `good`, `bad`, or `ambiguous` resolution status; large jobs may return `job_id`. | Citation Verification → Verify authorities. | Reporter/case-name mismatch is flagged; rate-limited or large jobs are resumable. “Good” is labeled as resolved, not good law. | Read-only, idempotent |
| `resume_citation_analysis` | `job_id`; optional `wait` (default false). | Next citation-verification batch from one-hour MCP session state. | Citation Verification and MCP Console. | Missing/expired jobs require a new analysis; rate limits are reported without automatic retry unless requested. | Read-only, cursor-advancing |
| `create_search_alert` | `name`, query string/object, rate (`rt`, `dly`, `wly`, `mly`, `off`), optional alert type (`o`, `r`, `d`, `oa`). | Creates CourtListener server-side alert. | Alerts → Review and create. | Upstream 400 detail is shown safely. | **State-changing; explicit challenge required** |
| `delete_search_alert` | Integer alert `id`. | Deletes CourtListener server-side alert. | Alerts → Delete. | Missing ID reports “not found.” | **Destructive; explicit challenge required** |
| `subscribe_to_docket_alert` | Integer CourtListener docket ID. | Creates CourtListener docket email subscription. | Docket workspace / Alerts. | Upstream invalid/duplicate subscription detail is displayed safely. | **State-changing; explicit challenge required** |
| `unsubscribe_from_docket_alert` | Integer CourtListener docket ID. | Removes matching docket subscription. | Docket workspace / Alerts. | Idempotent upstream behavior is preserved. | **Destructive; explicit challenge required** |
| `pray_for_document` | Integer RECAP document ID. | Creates a no-charge Pray and Pay request after checking document availability; uses account daily allowance. | Docket → Documents → Request via Pray and Pay. | Already-available, duplicate, missing, and limit conditions are stated explicitly. | **State-changing; explicit challenge required** |
| `withdraw_prayer` | Integer RECAP document ID. | Finds and deletes the pending prayer. | Alerts / RECAP document area and MCP Console. | Returns a clear message when no pending prayer exists. | **Destructive; explicit challenge required** |
| `get_api_usage` | No arguments. | Live quota scopes, 14-day history, and membership status. | Dashboard and MCP Console; credential validation probe. | Uses its own throttle scope and remains usable when the main quota is exhausted. | Read-only, idempotent |

## REST resources exposed through MCP

The reviewed client models these endpoint IDs: `dockets`,
`bankruptcy-information`, `originating-court-information`, `docket-entries`,
`recap-documents`, `courts`, `audio`, `clusters`, `opinions`,
`opinions-cited`, `tag`, `people`, `positions`, `retention-events`,
`educations`, `schools`, `political-affiliations`, `sources`, `aba-ratings`,
`parties`, `attorneys`, `recap-fetch`, `recap-query`,
`fjc-integrated-database`, `tags`, `docket-tags`, `prayers`,
`increment-event`, `visualizations/json`, `visualizations`, `agreements`,
`debts`, `financial-disclosures`, `gifts`, `investments`,
`non-investment-incomes`, `disclosure-positions`, `reimbursements`,
`spouse-incomes`, `alerts`, and `docket-alerts`.

The API Explorer deliberately routes list operations through the MCP
`call_endpoint` tool and item operations through `get_endpoint_item`. It does
not expose generic write methods, PACER purchasing, tag mutation, or other
unreviewed account actions.
