import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

if (process.env.COURTLISTENER_ENV_FILE) {
  const lines = readFileSync(process.env.COURTLISTENER_ENV_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    if (process.env[name] === undefined) process.env[name] = line.slice(separator + 1);
  }
}

const { config, validateConfig } = await import("../dist-server/server/config.js");
const { CourtListenerMcpClient, EXPECTED_MCP_TOOLS } = await import("../dist-server/server/mcp-client.js");
const { TokenStore } = await import("../dist-server/server/token-store.js");

if (process.env.COURTLISTENER_LIVE_AUDIT !== "1") {
  throw new Error("Set COURTLISTENER_LIVE_AUDIT=1 to acknowledge read-only calls against the configured CourtListener account");
}

validateConfig();
const tokenStore = new TokenStore(
  join(config.dataDir, "courtlistener-token.enc"),
  config.credentialKey,
  config.bootstrapToken,
);
const mcp = new CourtListenerMcpClient({
  endpoint: config.mcpEndpoint,
  timeoutMs: config.requestTimeoutMs,
  getToken: () => tokenStore.get(),
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rows(value) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  const record = object(value);
  if (Array.isArray(record.results)) return rows(record.results);
  if (Array.isArray(record.choices)) return rows(record.choices);
  if (record.data !== undefined) return rows(record.data);
  return [];
}

function first(...values) {
  return values.find((value) => typeof value === "string" && value.trim())
    ?? values.find((value) => typeof value === "number")
    ?? null;
}

function publicSample(value) {
  const item = rows(value)[0] ?? object(value);
  return {
    id: first(item.id, item.cluster_id, item.docket_id, item.person_id),
    title: first(item.caseName, item.case_name, item.name_full, item.name, item.description),
    court: first(item.court, item.court_id, item.court_name),
    date: first(item.dateFiled, item.date_filed, item.dateArgued, item.date_argued, item.year),
  };
}

function sampleId(value) {
  const item = rows(value)[0] ?? object(value);
  return first(item.id, item.cluster_id, item.docket_id, item.person_id);
}

function redact(value) {
  return String(value)
    .replace(/(authorization|token|api[_-]?key|secret)\s*[:=]\s*[^\s,;}]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]");
}

const report = {
  generatedAt: new Date().toISOString(),
  endpoint: config.mcpEndpoint,
  sourceRevision: null,
  inventory: { expected: [...EXPECTED_MCP_TOOLS], available: [], missing: [], unexpected: [] },
  checks: [],
  coverage: [],
};
const auditScope = process.env.COURTLISTENER_AUDIT_SCOPE || "full";
const minimumUpstreamIntervalMs = Math.max(0, Number(process.env.COURTLISTENER_AUDIT_INTERVAL_MS) || 6_500);
const upstreamTools = new Set(["search", "get_counts", "get_more_results", "call_endpoint", "get_endpoint_item", "read_document", "search_document", "extract_citations", "analyze_citations", "resume_citation_analysis"]);
let lastUpstreamCallAt = 0;

async function respectRateLimit(tool) {
  if (!upstreamTools.has(tool)) return;
  const waitMs = minimumUpstreamIntervalMs - (Date.now() - lastUpstreamCallAt);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastUpstreamCallAt = Date.now();
}

async function check(name, tool, args) {
  const started = performance.now();
  try {
    await respectRateLimit(tool);
    const response = await mcp.call(tool, args);
    const data = response.data;
    const record = object(data);
    const result = {
      name,
      tool,
      status: "pass",
      durationMs: Math.round(performance.now() - started),
      resultCount: rows(data).length,
      declaredCount: typeof record.count === "number" ? record.count : null,
      hasMore: record.has_more === true,
      sample: publicSample(data),
      topLevelFields: Object.keys(record).sort().slice(0, 40),
      schemaFields: Object.keys(object(record.properties)).sort().slice(0, 100),
      choiceValues: rows(data).map((item) => first(item.value, item.id)).filter(Boolean).slice(0, 100),
    };
    report.checks.push(result);
    return data;
  } catch (error) {
    report.checks.push({
      name,
      tool,
      status: "fail",
      durationMs: Math.round(performance.now() - started),
      error: redact(error instanceof Error ? error.message : String(error)).slice(0, 800),
    });
    return null;
  }
}

try {
  const tools = await mcp.listTools(true);
  report.inventory.available = tools.map((tool) => tool.name).sort();
  report.inventory.missing = EXPECTED_MCP_TOOLS.filter((name) => !report.inventory.available.includes(name));
  report.inventory.unexpected = report.inventory.available.filter((name) => !EXPECTED_MCP_TOOLS.includes(name));

  if (auditScope === "choices") {
    await check("Financial disclosure ordering choices", "get_choices", { endpoint_id: "financial-disclosures", field_name: "order_by" });
    await check("RECAP document ordering choices", "get_choices", { endpoint_id: "recap-documents", field_name: "order_by" });
  } else {
  await check("API account usage", "get_api_usage", {});
  const opinionSearch = await check("Supreme Court opinion search", "search", { type: "o", citation: "347 U.S. 483", court: "scotus", num_results: 5 });
  const judgeSearch = await check("Federal judge search", "search", { type: "p", q: "Sonia Sotomayor", num_results: 5 });
  const oralSearch = await check("Oral argument search", "search", { type: "oa", q: "Carpenter v. United States", num_results: 5 });
  const docketSearch = await check("RECAP federal docket search", "search", { type: "r", q: "United States v. Trump", available_only: true, num_results: 5 });
  const disclosureList = await check("Financial disclosure listing", "call_endpoint", { endpoint_id: "financial-disclosures", query: {}, num_results: 5 });

  const opinionQueryId = first(object(opinionSearch).query_id);
  if (opinionQueryId) {
    await check("Opinion search total", "get_counts", { query_id: opinionQueryId });
    await check("Opinion search next page", "get_more_results", { query_id: opinionQueryId, num_results: 5 });
  }

  await check("Financial disclosure ordering choices", "get_choices", { endpoint_id: "financial-disclosures", field_name: "order_by" });

  const judgeId = Number(sampleId(judgeSearch));
  if (Number.isSafeInteger(judgeId) && judgeId > 0) {
    await check("Known judge profile", "get_endpoint_item", { endpoint_id: "people", item_id: judgeId });
    await check("Known judge positions", "call_endpoint", { endpoint_id: "positions", query: { person: judgeId }, num_results: 20 });
    await check("Known judge education", "call_endpoint", { endpoint_id: "educations", query: { person: judgeId }, num_results: 20 });
    await check("Known judge disclosures", "call_endpoint", { endpoint_id: "financial-disclosures", query: { person: judgeId }, num_results: 20 });
  }

  const audioId = Number(sampleId(oralSearch));
  if (Number.isSafeInteger(audioId) && audioId > 0) {
    await check("Known oral argument record", "get_endpoint_item", { endpoint_id: "audio", item_id: audioId });
  }

  const docketId = Number(sampleId(docketSearch));
  if (Number.isSafeInteger(docketId) && docketId > 0) {
    await check("Known RECAP docket", "get_endpoint_item", { endpoint_id: "dockets", item_id: docketId });
    await check("Known docket entries", "call_endpoint", { endpoint_id: "docket-entries", query: { docket: docketId, order_by: "date_filed" }, num_results: 20 });
    await check("Known docket documents", "call_endpoint", { endpoint_id: "recap-documents", query: { docket_entry: { docket: docketId } }, num_results: 20 });
    await check("Known docket parties", "call_endpoint", { endpoint_id: "parties", query: { docket: docketId }, num_results: 20 });
    await check("Known docket attorneys", "call_endpoint", { endpoint_id: "attorneys", query: { docket: docketId }, num_results: 20 });
  }

  const opinionId = Number(sampleId(opinionSearch));
  if (Number.isSafeInteger(opinionId) && opinionId > 0) {
    await check("Known opinion record", "get_endpoint_item", { endpoint_id: "opinions", item_id: opinionId });
    await check("Known opinion document", "read_document", { opinion_id: opinionId, chunk_index: 0, chunk_size: 12_000 });
    await check("Search within known opinion", "search_document", { opinion_id: opinionId, query: "equal protection", snippet_size: 300 });
    await check("Authorities cited by known opinion", "call_endpoint", { endpoint_id: "opinions-cited", query: { citing_opinion: opinionId }, num_results: 20 });
    await check("Opinions citing known opinion", "call_endpoint", { endpoint_id: "opinions-cited", query: { cited_opinion: opinionId }, num_results: 20 });
  }

  await check("Extract known legal citation", "extract_citations", { text: "Brown v. Board of Education, 347 U.S. 483 (1954)." });
  const citationAnalysis = await check("Verify known legal citation", "analyze_citations", { text: "Brown v. Board of Education, 347 U.S. 483 (1954)." });
  const citationJobId = first(object(citationAnalysis).job_id);
  if (citationJobId) await check("Resume citation verification", "resume_citation_analysis", { job_id: citationJobId });

  const disclosureId = Number(sampleId(disclosureList));
  if (Number.isSafeInteger(disclosureId) && disclosureId > 0) {
    await check("Known disclosure record", "get_endpoint_item", { endpoint_id: "financial-disclosures", item_id: disclosureId });
  }

  for (const endpointId of ["people", "financial-disclosures", "audio", "dockets", "docket-entries", "recap-documents", "parties", "attorneys"]) {
    await check(`${endpointId} schema`, "get_endpoint_schema", { endpoint_id: endpointId });
  }
  }
} finally {
  await mcp.disconnect();
}

const testedTools = new Set(report.checks.filter((item) => item.status === "pass").map((item) => item.tool));
const stateChangingTools = new Set([
  "create_search_alert",
  "delete_search_alert",
  "subscribe_to_docket_alert",
  "unsubscribe_from_docket_alert",
  "pray_for_document",
  "withdraw_prayer",
]);
report.coverage = report.inventory.available.map((tool) => ({
  tool,
  status: testedTools.has(tool)
    ? "live-pass"
    : stateChangingTools.has(tool)
      ? "confirmation-gated; controlled mutation pending"
      : tool === "resume_citation_analysis" && !report.checks.some((item) => item.tool === tool)
        ? "not-required; citation analysis completed synchronously"
        : "not-tested",
}));
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.COURTLISTENER_AUDIT_REPORT) writeFileSync(process.env.COURTLISTENER_AUDIT_REPORT, serialized, { mode: 0o600 });
process.stdout.write(serialized);
if (report.inventory.missing.length || report.checks.some((item) => item.status === "fail")) process.exitCode = 1;
