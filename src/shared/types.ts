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
