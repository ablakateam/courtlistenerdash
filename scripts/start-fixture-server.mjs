import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const password = process.env.COURTLISTENER_FIXTURE_PASSWORD || "Fixture review credential! 42";
const port = Math.max(1024, Number(process.env.COURTLISTENER_FIXTURE_PORT) || 8891);
const directory = mkdtempSync(join(tmpdir(), "courtlistenerdash-fixture-"));

const { createApp } = await import("../dist-server/server/app.js");
const { AppDatabase } = await import("../dist-server/server/database.js");
const { EXPECTED_MCP_TOOLS, STATE_CHANGING_TOOLS } = await import("../dist-server/server/mcp-client.js");
const { SecurityManager, hashPassword } = await import("../dist-server/server/security.js");
const { TokenStore } = await import("../dist-server/server/token-store.js");
const { PasswordStore } = await import("../dist-server/server/password-store.js");
const { LegalAiConfigStore } = await import("../dist-server/server/ai-config-store.js");
const { LegalAiClient } = await import("../dist-server/server/legal-ai.js");

const brownCluster = {
  id: 105221,
  case_name: "Brown v. Board of Education of Topeka",
  case_name_full: "BROWN Et Al. v. BOARD OF EDUCATION OF TOPEKA Et Al.",
  citations: [{ cite: "347 U.S. 483" }],
  court: "https://www.courtlistener.com/api/rest/v4/courts/scotus/",
  court_id: "scotus",
  docket: "https://www.courtlistener.com/api/rest/v4/dockets/2741731/",
  docket_number: "1",
  date_filed: "1954-05-17",
  precedential_status: "Published",
  judges: "Warren, C.J.",
  syllabus: "State laws establishing separate public schools deny equal protection of the laws.",
  absolute_url: "/opinion/105221/brown-v-board-of-education-of-topeka/",
};
const brownOpinion = {
  id: 105221,
  cluster: 105221,
  type: "020lead",
  author_str: "Warren, C.J.",
  download_url: "https://storage.courtlistener.com/pdf/fixture/brown.pdf",
};
const brownCompanion = {
  ...brownCluster,
  id: 105223,
  cluster_id: 105223,
  case_name: "Bolling v. Sharpe",
  case_name_full: "Bolling v. Sharpe",
  citations: [{ cite: "347 U.S. 497" }],
  absolute_url: "/opinion/105223/bolling-v-sharpe/",
};
const federalDocket = {
  id: 67490071,
  case_name: "United States v. Trump",
  case_name_full: "United States of America v. Donald J. Trump",
  docket_number: "9:23-cr-80101",
  court: "https://www.courtlistener.com/api/rest/v4/courts/flsd/",
  date_filed: "2023-06-08",
  source: "RECAP",
};
const argument = {
  id: 106409,
  case_name: "Carpenter v. United States",
  date_argued: "2017-11-29",
  judges: "Roberts, C.J., and the Court",
  duration: 3975,
  docket: "https://www.courtlistener.com/api/rest/v4/dockets/999/",
  local_path_mp3: "audio/fixture/carpenter.mp3",
  stt_transcript: "Chief Justice Roberts: We will hear argument in Carpenter v. United States.\n\nCounsel discussed historical cell-site location information and the Fourth Amendment.",
  absolute_url: "/audio/106409/carpenter-v-united-states/",
};
const judge = {
  id: 3045,
  name_first: "Sonia",
  name_last: "Sotomayor",
  name_full: "Sonia Sotomayor",
  gender: "Female",
  date_dob: "1954-06-25",
  fjc_id: "1393846",
};
const disclosure = {
  id: 34207,
  person: "https://www.courtlistener.com/api/rest/v4/people/3045/",
  year: 2022,
  page_count: 9,
  has_been_extracted: true,
  filepath: "https://storage.courtlistener.com/financial-disclosures/fixture/34207.pdf",
  date_created: "2023-08-01T12:00:00Z",
};
const opinionText = `<p>These cases come to us from the States of Kansas, South Carolina, Virginia, and Delaware.</p><p>We conclude that in the field of public education the doctrine of separate but equal has no place. Separate educational facilities are inherently unequal.</p><p>The judgments below are reversed, and the cases are remanded.</p>`;

const toolDefinitions = EXPECTED_MCP_TOOLS.map((name) => ({
  name,
  title: name.replaceAll("_", " "),
  description: `Fixture definition for ${name}`,
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: !STATE_CHANGING_TOOLS.has(name) },
}));
const events = [];
const fixtureState = {
  alerts: [{ id: 81, name: "Qualified immunity developments", query: "qualified immunity", rate: "dly" }],
};

function result(data, tool, started) {
  const durationMs = Date.now() - started;
  events.unshift({ id: randomUUID(), tool, arguments: {}, result: data, startedAt: new Date(started).toISOString(), durationMs, stateChanging: STATE_CHANGING_TOOLS.has(tool) });
  return { tool, data, raw: data, durationMs, calledAt: new Date().toISOString() };
}

function endpointRows(endpoint, query = {}) {
  if (endpoint === "opinions") return [brownOpinion];
  if (endpoint === "docket-entries") return [
    { id: 1, entry_number: 1, date_filed: "2023-06-08", description: "Indictment filed" },
    { id: 2, entry_number: 2, date_filed: "2023-06-09", description: "Notice of appearance" },
  ];
  if (endpoint === "recap-documents") return [{ id: 7001, document_number: "1", description: "Indictment", page_count: 49, is_available: true, filepath_local: "https://storage.courtlistener.com/recap/fixture/indictment.pdf" }];
  if (endpoint === "parties") return [{ id: 1, name: "United States of America", type: "Plaintiff" }, { id: 2, name: "Donald J. Trump", type: "Defendant" }];
  if (endpoint === "attorneys") return [{ id: 1, name: "Fixture counsel", role: "Counsel of record" }];
  if (endpoint === "audio") return [argument];
  if (endpoint === "positions") return [{ id: 1, court: "Supreme Court of the United States", position_type: "Justice", date_start: "2009-08-08" }];
  if (endpoint === "educations") return [{ id: 1, school: "Yale Law School", degree_level: "J.D.", degree_year: 1979 }];
  if (endpoint === "political-affiliations") return [];
  if (endpoint === "financial-disclosures") return [disclosure];
  if (endpoint === "investments") return [{ id: 1, description: "Publicly reported investment", gross_value_code: "J", transaction_type: "Reported holding" }];
  if (["debts", "gifts", "agreements", "non-investment-incomes", "disclosure-positions", "reimbursements", "spouse-incomes"].includes(endpoint)) return [];
  if (endpoint === "opinions-cited") {
    if (query.citing_opinion) return [{ id: 1, citing_opinion: 105221, cited_opinion: 105222, citation: "163 U.S. 537" }];
    return [{ id: 2, citing_opinion: 110001, cited_opinion: 105221, citation: "347 U.S. 483" }];
  }
  if (endpoint === "alerts") return fixtureState.alerts;
  if (endpoint === "docket-alerts") return [{ id: 9, docket: 67490071, alert_type: "all", date_created: "2026-09-01" }];
  if (endpoint === "prayers") return [];
  return [{ id: 1, endpoint, status: "fixture record" }];
}

const fakeMcp = {
  async testCredential() { return { toolCount: toolDefinitions.length, tools: toolDefinitions }; },
  async disconnect() {},
  async listTools() { return toolDefinitions; },
  getEvents() { return structuredClone(events); },
  status() { return { connected: true, toolCount: toolDefinitions.length, lastSuccess: new Date().toISOString(), lastError: null }; },
  async call(tool, args) {
    const started = Date.now();
    if (tool === "get_api_usage") return result({
      current_usage: { user: { limits: [
        { rate: "10/min", used: 2, limit: 10, remaining: 8, window_seconds: 60, blocked: false },
        { rate: "100/hour", used: 24, limit: 100, remaining: 76, window_seconds: 3600, blocked: false },
        { rate: "250/day", used: 61, limit: 250, remaining: 189, window_seconds: 86400, blocked: false },
      ] } },
      historical_usage: { "2026-09-18": 1, "2026-09-19": 36, total: 37 },
    }, tool, started);
    if (tool === "get_choices") return result({ choices: [
      { value: "scotus", display_name: "Supreme Court of the United States" },
      { value: "flsd", display_name: "U.S. District Court for the Southern District of Florida" },
      { value: "ca10", display_name: "U.S. Court of Appeals for the Tenth Circuit" },
    ] }, tool, started);
    if (tool === "search") {
      const type = args.type || "o";
      if (type === "p") return result({ count: 1, results: [judge], query_id: "fixture-people", has_more: false }, tool, started);
      if (type === "oa") return result({ count: 1, results: [argument], query_id: "fixture-audio", has_more: false }, tool, started);
      if (type === "rd") return result({ count: 1, results: endpointRows("recap-documents"), query_id: "fixture-document", has_more: false }, tool, started);
      if (["d", "r"].includes(type)) return result({ count: 1, results: [federalDocket], query_id: "fixture-docket", has_more: false }, tool, started);
      if (String(args.q || "").includes("pagination fixture")) return result({ count: 2, results: [{ ...brownCluster, cluster_id: 105221, snippet: "First page authority." }], query_id: "fixture-pagination", has_more: true }, tool, started);
      return result({ count: 1, results: [{ ...brownCluster, cluster_id: 105221, snippet: "Separate educational facilities are inherently unequal." }], query_id: "fixture-opinion", has_more: false }, tool, started);
    }
    if (tool === "get_more_results") return result({ count: 2, results: args.query_id === "fixture-pagination" ? [brownCompanion] : [], query_id: args.query_id, has_more: false }, tool, started);
    if (tool === "get_counts") return result({ o: 1, d: 1, oa: 1, p: 1 }, tool, started);
    if (tool === "get_endpoint_schema") return result({ endpoint: args.endpoint_id, filters: { id: { type: "number" } }, ordering: ["id"] }, tool, started);
    if (tool === "call_endpoint") return result({ count: endpointRows(args.endpoint_id, args.query).length, results: endpointRows(args.endpoint_id, args.query) }, tool, started);
    if (tool === "get_endpoint_item") {
      const id = Number(args.item_id);
      if (args.endpoint_id === "clusters") return result(brownCluster, tool, started);
      if (args.endpoint_id === "opinions") return result(id === 105221 ? brownOpinion : { id, cluster: 105221 }, tool, started);
      if (args.endpoint_id === "dockets") return result(id === 67490071 ? federalDocket : { ...federalDocket, id }, tool, started);
      if (args.endpoint_id === "audio") return result(argument, tool, started);
      if (args.endpoint_id === "people") return result(judge, tool, started);
      if (args.endpoint_id === "financial-disclosures") return result(disclosure, tool, started);
      return result({ id, endpoint: args.endpoint_id }, tool, started);
    }
    if (tool === "read_document") return result({ text: opinionText, total_chunks: 1, chunk_index: 0 }, tool, started);
    if (tool === "search_document") return result({ matches: [{ paragraph: "P2", text: "Separate educational facilities are inherently unequal." }] }, tool, started);
    if (tool === "extract_citations") return result({ citations: ["347 U.S. 483"] }, tool, started);
    if (tool === "analyze_citations") {
      if (String(args.text || "").includes("fixture all verification states")) return result(`Citation Analysis (Job ID: fixture-pending-job)\n\nExtraction: 6 citation occurrence(s), 5 unique citation string(s), 2 unique case cluster(s), 1 unresolved.\nVerification: 2 of 5 verified. (1 pending — use resume_citation_analysis with job_id="fixture-pending-job")\nWARNING: 1 citation(s) matched by reporter but case name differs significantly — possible hallucinations.\n\nCases:\n  1. 347 U.S. 483 — ${brownCluster.case_name_full} (${brownCluster.date_filed})\n     Status: FOUND (cited by 100000 opinion(s))\n     Cluster ID: ${brownCluster.id}\n     References in document: 1 (1 full)\n     URL: https://www.courtlistener.com${brownCluster.absolute_url}\n  2. 999 U.S. 1\n     Status: NOT FOUND — may be incorrect or not in CourtListener\n     References in document: 1 (1 full)\n  3. 500 F.3d 10\n     Status: AMBIGUOUS — matches 2 cases:\n       - Example One (cluster_id=501; 2001-01-01; cited by 4)\n       - Example Two (cluster_id=502; 2002-02-02; cited by 2)\n     References in document: 1 (1 full)\n  4. 410 U.S. 113 — Roe v. Wade (1973-01-22)\n     WARNING: Input case name "Fixture v. Fiction" differs from verified "Roe v. Wade" (similarity 0.10). Possible hallucinated citation.\n     Status: FOUND (cited by 50000 opinion(s))\n     Cluster ID: 108713\n     References in document: 1 (1 full)\n     URL: https://www.courtlistener.com/opinion/108713/roe-v-wade/\n  5. 585 U.S. 296\n     Status: PENDING\n\nUnresolved:\n  1. [IdCitation] "Id."`, tool, started);
      return result(`Citation Analysis (Job ID: fixture-citation-job)\n\nExtraction: 1 citation occurrence(s), 1 unique citation string(s), 1 unique case cluster(s).\nVerification: 1 of 1 verified.\n\nCases:\n  1. 347 U.S. 483 — ${brownCluster.case_name_full} (${brownCluster.date_filed})\n     Status: FOUND (cited by 100000 opinion(s))\n     Cluster ID: ${brownCluster.id}\n     References in document: 1 (1 full)\n     URL: https://www.courtlistener.com${brownCluster.absolute_url}`, tool, started);
    }
    if (tool === "resume_citation_analysis") return result(`Citation Analysis (Job ID: ${args.job_id}) — Resumed\n\nVerification: 1 of 1 verified.\nAll citations verified!\n\nNewly verified (1):\n  1. 585 U.S. 296 — Carpenter v. United States (2018-06-22)\n     Status: FOUND (cited by 1000 opinion(s))\n     Cluster ID: 6359710\n     References in document: 1 (1 full)\n     URL: https://www.courtlistener.com/opinion/6359710/carpenter-v-united-states/`, tool, started);
    if (tool === "create_search_alert") {
      fixtureState.alerts.push({ id: 82, name: args.name, query: args.query?.q || "", rate: args.rate });
      return result({ id: 82, created: true }, tool, started);
    }
    if (tool === "delete_search_alert") {
      fixtureState.alerts = fixtureState.alerts.filter((item) => item.id !== Number(args.id));
      return result({ deleted: true }, tool, started);
    }
    return result({ ok: true, tool, fixture: true }, tool, started);
  },
};

const passwordHash = await hashPassword(password);
const credentialKey = randomBytes(32).toString("base64");
const config = {
  version: "1.2.0-fixture",
  host: "127.0.0.1",
  port,
  publicPort: port,
  dataDir: directory,
  mcpEndpoint: "https://mcp.courtlistener.com/",
  mcpHealthEndpoint: "data:application/json,%7B%22revision%22%3A%22fixture%22%7D",
  sessionSecret: randomBytes(48).toString("base64url"),
  credentialKey,
  passwordHash,
  bootstrapToken: "fixture-token-not-real",
  tlsCertPath: null,
  tlsKeyPath: null,
  tlsEnabled: false,
  allowInsecureCredentialSetup: true,
  secureCookies: false,
  trustProxy: false,
  sessionTtlMs: 60 * 60_000,
  requestTimeoutMs: 5_000,
  aiRequestTimeoutMs: 5_000,
  maxRequestsPerMinute: 1_000,
  lanUrls: [`http://127.0.0.1:${port}`],
};
const tokenStore = new TokenStore(join(directory, "token.enc"), credentialKey, config.bootstrapToken);
const passwordStore = new PasswordStore(join(directory, "password.hash"), passwordHash);
const aiConfigStore = new LegalAiConfigStore(join(directory, "ai.enc"), credentialKey);
const legalAi = new LegalAiClient(aiConfigStore, 5_000);
const database = new AppDatabase(join(directory, "fixture.sqlite3"));
const security = new SecurityManager({ passwordHash, sessionSecret: config.sessionSecret, sessionTtlMs: config.sessionTtlMs, secureCookies: false });
const app = createApp({ config, security, tokenStore, mcp: fakeMcp, db: database, passwordStore, aiConfigStore, legalAi });
const server = createServer(app);

server.listen(port, "127.0.0.1", () => process.stdout.write(`CourtListenerDash fixture server listening on http://127.0.0.1:${port}\n`));

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise((resolve) => server.close(resolve));
  database.close();
  rmSync(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
