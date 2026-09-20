export type JsonObject = Record<string, unknown>;

export interface McpToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema: JsonObject;
  outputSchema?: JsonObject;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    [key: string]: unknown;
  };
}

export interface ToolResult {
  tool: string;
  data: unknown;
  raw: unknown;
  durationMs: number;
  calledAt: string;
}

export interface ConnectionStatus {
  web: "healthy" | "degraded";
  mcp: "connected" | "disconnected" | "error" | "checking";
  api: "available" | "unavailable" | "unknown";
  authenticated: boolean;
  credentialConfigured: boolean;
  lastSuccessfulRequest: string | null;
  lastError: string | null;
  endpoint: string;
  toolCount: number;
  sourceRevision?: string | null;
  lanUrls: string[];
  version: string;
  legalAi?: LegalAiStatus;
  typeSafe?: TypeSafeStatus;
}

export type TypeSafeMode = "off" | "evaluation" | "shadow" | "active";

export interface TypeSafeModelOption {
  name: string;
  description: string;
  releaseDate: string;
}

export interface TypeSafeStatus {
  configured: boolean;
  available: boolean;
  mode: TypeSafeMode;
  model: string | null;
  actualModel: string | null;
  endpoint: "https://api.typesafe.ai";
  lastCheckedAt: string | null;
  lastSuccessfulDecisionAt: string | null;
  lastError: string | null;
  models: TypeSafeModelOption[];
  usage: {
    requests: number;
    inputTokens: number;
    estimatedCostUsd: number;
    averageLatencyMs: number | null;
    cacheHits: number;
  };
}

export interface JevSignal {
  key: "overall" | "legal_issue" | "facts" | "procedure" | "direct_answer" | "distinguish_limit";
  label: string;
  probability: number;
  kind: "model_inference";
}

export interface JevDecisionLens {
  status: "not_configured" | "off" | "shadow" | "active" | "unavailable" | "complete";
  mode: TypeSafeMode;
  schemaVersion: "search_relevance_noul_v1";
  modelVersion: string | null;
  originalRank: number;
  assistedRank: number;
  relevanceBand: "Directly responsive" | "Materially relevant" | "Potentially useful" | "Topical only" | "Uncertain";
  overallProbability: number;
  signals: JevSignal[];
  evidenceExcerpt: string;
  sourceHash: string;
  durationMs: number | null;
  inputTokens: number;
  estimatedCostUsd: number;
  experimental: true;
}

export type LegalAiProvider = "ollama" | "openai" | "anthropic";

export interface LegalAiStatus {
  configured: boolean;
  available: boolean;
  provider: LegalAiProvider | null;
  model: string | null;
  baseUrl: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface LegalAiModelOption {
  name: string;
  displayName: string;
  source: "cloud" | "local";
  size: number | null;
  family: string | null;
  parameterSize: string | null;
  modifiedAt: string | null;
}

export interface LegalAiModelCatalog {
  provider: "ollama";
  baseUrl: string;
  models: LegalAiModelOption[];
  fetchedAt: string;
}

export interface SourcePassage {
  paragraph: string;
  excerpt: string;
  verified: true;
}

export interface GroundedClaim {
  text: string;
  sources: SourcePassage[];
}

export interface KeyAuthority extends GroundedClaim {
  citation: string;
  treatment: string | null;
}

export interface CaseAnalysis {
  schemaVersion: 1;
  clusterId: number;
  opinionId: number;
  generatedAt: string;
  provider: LegalAiProvider;
  model: string;
  sourceHash: string;
  coverage: {
    totalCharacters: number;
    totalParagraphs: number;
    sectionsAnalyzed: number;
    completeDocumentReviewed: true;
  };
  overview: GroundedClaim | null;
  proceduralPosture: GroundedClaim | null;
  materialFacts: GroundedClaim[];
  legalIssues: GroundedClaim[];
  questionsPresented: GroundedClaim[];
  holding: GroundedClaim | null;
  ruleOfLaw: GroundedClaim | null;
  reasoning: GroundedClaim[];
  keyAuthorities: KeyAuthority[];
  factualDistinctions: GroundedClaim[];
  disposition: GroundedClaim | null;
  separateOpinions: GroundedClaim[];
  practicalSignificance: GroundedClaim | null;
  limitations: GroundedClaim[];
  verificationNotice: string;
}

export interface CaseAnalysisState {
  status: "not_started" | "queued" | "running" | "complete" | "error";
  progress: number;
  stage: string;
  error: string | null;
  updatedAt: string | null;
  analysis: CaseAnalysis | null;
  ai: LegalAiStatus;
}

export interface GroundedAnswer {
  answer: GroundedClaim | null;
  caveats: string[];
  provider: LegalAiProvider;
  model: string;
  generatedAt: string;
}

export interface PageAssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface PageAssistantAnswer {
  answer: GroundedClaim | null;
  caveats: string[];
  suggestedQuestions: string[];
  provider: LegalAiProvider;
  model: string;
  generatedAt: string;
  context: {
    route: string;
    pageTitle: string;
    capturedCharacters: number;
    indexedPassages: number;
    retrievedPassages: number;
    availableActions: number;
    retrievalMode: "live_page_rag";
    truncated: boolean;
    protected: boolean;
  };
}

export type SemanticResearchIntent =
  | "issue"
  | "similar_facts"
  | "doctrine"
  | "procedure"
  | "reasoning"
  | "distinguish_limit";

export interface ApiUsageLimit {
  rate: string;
  used: number;
  limit: number;
  remaining: number;
  windowSeconds: number;
  resetAt: string | null;
  blocked: boolean;
}

export interface ApiUsageSummary {
  minute: ApiUsageLimit | null;
  hour: ApiUsageLimit | null;
  day: ApiUsageLimit | null;
  historical: Array<{ date: string; count: number }>;
  fourteenDayTotal: number;
  checkedAt: string;
}

export interface ActivityRecord {
  id: number;
  category: string;
  action: string;
  summary: string;
  status: "success" | "error" | "pending";
  durationMs: number | null;
  createdAt: string;
}

export interface SavedResearch {
  id: number;
  kind: string;
  title: string;
  subtitle: string | null;
  courtlistenerUrl: string | null;
  payload: unknown;
  createdAt: string;
}

export interface SearchRequest {
  query: string;
  type: "o" | "r" | "rd" | "d" | "p" | "oa";
  semantic?: boolean;
  court?: string;
  filedAfter?: string;
  filedBefore?: string;
  judge?: string;
  citation?: string;
  numResults?: number;
  researchQuestion?: string;
  researchIntent?: SemanticResearchIntent;
}

export interface ConfirmationChallenge {
  challengeId: string;
  tool: string;
  summary: string;
  expiresAt: string;
}

export interface ConsoleEvent {
  id: string;
  tool: string;
  arguments: JsonObject;
  result?: unknown;
  error?: string;
  startedAt: string;
  durationMs?: number;
  retryCount?: number;
  stateChanging: boolean;
}

export interface ToolCoverageRow {
  name: string;
  available: boolean;
  implemented: boolean;
  uiLocation: string;
  tested: "live" | "schema" | "pending";
  result: string;
  stateChanging: boolean;
}
