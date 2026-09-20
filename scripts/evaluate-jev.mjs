import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  process.stderr.write("Usage: npm run eval:jev -- <attorney-reviewed.jsonl>\n");
  process.exit(2);
}

const lines = (await readFile(resolve(inputPath), "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

const rows = lines.map((line, index) => {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    throw new Error(`Invalid JSON on line ${index + 1}`);
  }
  const required = ["queryId", "candidateId", "label", "score", "baselineRank", "jevRank"];
  for (const key of required) {
    if (!(key in row)) throw new Error(`Line ${index + 1} is missing ${key}`);
  }
  if (!Number.isInteger(row.label) || row.label < 0 || row.label > 3) {
    throw new Error(`Line ${index + 1} label must be an integer from 0 to 3`);
  }
  if (typeof row.score !== "number" || row.score < 0 || row.score > 1) {
    throw new Error(`Line ${index + 1} score must be a probability from 0 to 1`);
  }
  return row;
});

if (!rows.length) throw new Error("The evaluation dataset has no labeled candidate rows");

const grouped = new Map();
for (const row of rows) {
  const list = grouped.get(row.queryId) || [];
  list.push(row);
  grouped.set(row.queryId, list);
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values, percentileValue) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)];
};
const round = (value, places = 4) => Number(value.toFixed(places));
const relevant = (row) => row.label >= 2;

function rankedMetrics(rankField) {
  const ndcg = [];
  const reciprocalRanks = [];
  const precisions = [];
  const recalls = [];
  for (const queryRows of grouped.values()) {
    const ranked = [...queryRows].sort((a, b) => a[rankField] - b[rankField]);
    const ideal = [...queryRows].sort((a, b) => b.label - a.label);
    const dcg = (items) => items.slice(0, 10).reduce((sum, row, index) => sum + (2 ** row.label - 1) / Math.log2(index + 2), 0);
    const idealDcg = dcg(ideal);
    ndcg.push(idealDcg ? dcg(ranked) / idealDcg : 1);
    const firstRelevant = ranked.slice(0, 10).findIndex(relevant);
    reciprocalRanks.push(firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1));
    precisions.push(ranked.slice(0, 5).filter(relevant).length / 5);
    const totalRelevant = queryRows.filter(relevant).length;
    recalls.push(totalRelevant ? ranked.slice(0, 10).filter(relevant).length / totalRelevant : 1);
  }
  return {
    nDCG10: round(mean(ndcg)),
    MRR10: round(mean(reciprocalRanks)),
    precision5: round(mean(precisions)),
    recall10: round(mean(recalls)),
  };
}

const brier = mean(rows.map((row) => (row.score - (relevant(row) ? 1 : 0)) ** 2));
const bins = Array.from({ length: 10 }, () => []);
for (const row of rows) bins[Math.min(9, Math.floor(row.score * 10))].push(row);
const calibration = bins.map((items, index) => ({
  range: `${(index / 10).toFixed(1)}–${((index + 1) / 10).toFixed(1)}`,
  count: items.length,
  meanConfidence: items.length ? round(mean(items.map((row) => row.score))) : null,
  observedRelevant: items.length ? round(mean(items.map((row) => relevant(row) ? 1 : 0))) : null,
}));
const ece = bins.reduce((sum, items) => {
  if (!items.length) return sum;
  const confidence = mean(items.map((row) => row.score));
  const observed = mean(items.map((row) => relevant(row) ? 1 : 0));
  return sum + items.length / rows.length * Math.abs(confidence - observed);
}, 0);
const latencies = rows.map((row) => row.latencyMs).filter(Number.isFinite);
const costs = rows.map((row) => row.estimatedCostUsd).filter(Number.isFinite);

const report = {
  dataset: resolve(inputPath),
  queries: grouped.size,
  candidates: rows.length,
  relevanceDefinition: "label >= 2 on the attorney-reviewed 0–3 scale",
  baseline: rankedMetrics("baselineRank"),
  jev: rankedMetrics("jevRank"),
  calibration: { brier: round(brier), ece: round(ece), bins: calibration },
  operations: {
    latencyMs: { p50: round(percentile(latencies, 0.5), 1), p95: round(percentile(latencies, 0.95), 1) },
    estimatedCostUsd: round(costs.reduce((sum, value) => sum + value, 0), 6),
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
