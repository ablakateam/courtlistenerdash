export const SEARCH_RELEVANCE_SCHEMA_VERSION = "search_relevance_noul_v1" as const;

export interface DecisionSchemaDefinition {
  version: string;
  purpose: string;
  sourceBoundary: string;
  status: "implemented" | "proposed";
  productionGate: string;
}

/**
 * Jev decisions are application contracts. Adding or changing a question requires
 * a new version instead of silently changing the meaning of stored probabilities.
 */
export const TYPESAFE_SCHEMA_REGISTRY: readonly DecisionSchemaDefinition[] = [
  {
    version: SEARCH_RELEVANCE_SCHEMA_VERSION,
    purpose: "Rerank CourtListener opinion candidates for a stated legal research question and intent.",
    sourceBoundary: "Public CourtListener opinion metadata and matched opinion passages only.",
    status: "implemented",
    productionGate: "Attorney-reviewed relevance benchmark must pass before active mode is enabled.",
  },
  {
    version: "opinion_structure_noul_v1",
    purpose: "Locate facts, issue, rule, analysis, holding, disposition, concurrence, and dissent passages.",
    sourceBoundary: "Public CourtListener opinion text only.",
    status: "proposed",
    productionGate: "Paragraph-level attorney labels and provenance recall evaluation.",
  },
  {
    version: "assistant_context_gate_noul_v1",
    purpose: "Select retrieved CourtListener passages that are responsive enough to enter assistant context.",
    sourceBoundary: "Public CourtListener research records only.",
    status: "proposed",
    productionGate: "Context precision, missed-authority, latency, and prompt-injection tests.",
  },
  {
    version: "summary_claim_support_noul_v1",
    purpose: "Check whether cited opinion passages support individual AI case-summary claims.",
    sourceBoundary: "AI claim plus its cited public CourtListener passage.",
    status: "proposed",
    productionGate: "Attorney-reviewed support/contradiction dataset; never presented as citation validity.",
  },
  {
    version: "query_route_noul_v1",
    purpose: "Route a research request to case law, RECAP, citation, judge, oral-argument, or verification tools.",
    sourceBoundary: "User research query only.",
    status: "proposed",
    productionGate: "Routing accuracy and high-risk misroute tests across every supported collection.",
  },
] as const;
