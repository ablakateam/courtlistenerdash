import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ActivityRecord, CaseAnalysis, SavedResearch } from "../shared/types.js";

export interface StoredAnalysisState {
  clusterId: number;
  opinionId: number;
  status: "queued" | "running" | "complete" | "error";
  progress: number;
  stage: string;
  error: string | null;
  analysis: CaseAnalysis | null;
  provider: string | null;
  model: string | null;
  updatedAt: string;
}

export class AppDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success','error','pending')),
        duration_ms INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_research (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        courtlistener_url TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS action_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        summary TEXT NOT NULL,
        arguments_json TEXT NOT NULL,
        status TEXT NOT NULL,
        result_summary TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS case_analysis (
        opinion_id INTEGER PRIMARY KEY,
        cluster_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','running','complete','error')),
        progress INTEGER NOT NULL DEFAULT 0,
        stage TEXT NOT NULL,
        error TEXT,
        result_json TEXT,
        provider TEXT,
        model TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    this.db.prepare(
      "UPDATE case_analysis SET status='error', error='Analysis was interrupted by a service restart. Start it again.', stage='Interrupted', updated_at=? WHERE status IN ('queued','running')",
    ).run(new Date().toISOString());
  }

  recordActivity(
    category: string,
    action: string,
    summary: string,
    status: ActivityRecord["status"],
    durationMs: number | null,
  ): void {
    this.db
      .prepare(
        "INSERT INTO activity(category,action,summary,status,duration_ms,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(category, action, summary.slice(0, 500), status, durationMs, new Date().toISOString());
    this.db.exec("DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 500)");
  }

  listActivity(limit = 20): ActivityRecord[] {
    const rows = this.db
      .prepare(
        "SELECT id,category,action,summary,status,duration_ms AS durationMs,created_at AS createdAt FROM activity ORDER BY id DESC LIMIT ?",
      )
      .all(Math.max(1, Math.min(limit, 100)));
    return rows as unknown as ActivityRecord[];
  }

  saveResearch(input: Omit<SavedResearch, "id" | "createdAt">): SavedResearch {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        "INSERT INTO saved_research(kind,title,subtitle,courtlistener_url,payload_json,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        input.kind.slice(0, 80),
        input.title.slice(0, 300),
        input.subtitle?.slice(0, 500) ?? null,
        input.courtlistenerUrl?.slice(0, 1000) ?? null,
        JSON.stringify(input.payload ?? {}),
        createdAt,
      );
    return { ...input, id: Number(result.lastInsertRowid), createdAt };
  }

  listSaved(limit = 100): SavedResearch[] {
    const rows = this.db
      .prepare(
        "SELECT id,kind,title,subtitle,courtlistener_url AS courtlistenerUrl,payload_json AS payloadJson,created_at AS createdAt FROM saved_research ORDER BY id DESC LIMIT ?",
      )
      .all(Math.max(1, Math.min(limit, 500))) as unknown as Array<
      Omit<SavedResearch, "payload"> & { payloadJson: string }
    >;
    return rows.map(({ payloadJson, ...row }) => ({ ...row, payload: JSON.parse(payloadJson) }));
  }

  deleteSaved(id: number): boolean {
    return this.db.prepare("DELETE FROM saved_research WHERE id=?").run(id).changes > 0;
  }

  recordAction(tool: string, summary: string, args: unknown, status: string, resultSummary = ""): void {
    this.db
      .prepare(
        "INSERT INTO action_audit(tool,summary,arguments_json,status,result_summary,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        tool,
        summary.slice(0, 500),
        JSON.stringify(args).slice(0, 20_000),
        status,
        resultSummary.slice(0, 1000),
        new Date().toISOString(),
      );
  }

  listActionAudit(limit = 100): unknown[] {
    return this.db
      .prepare(
        "SELECT id,tool,summary,arguments_json AS argumentsJson,status,result_summary AS resultSummary,created_at AS createdAt FROM action_audit ORDER BY id DESC LIMIT ?",
      )
      .all(Math.max(1, Math.min(limit, 500))) as unknown[];
  }

  setAnalysisState(input: {
    clusterId: number;
    opinionId: number;
    status: StoredAnalysisState["status"];
    progress: number;
    stage: string;
    error?: string | null;
    analysis?: CaseAnalysis | null;
    provider?: string | null;
    model?: string | null;
  }): void {
    this.db.prepare(`
      INSERT INTO case_analysis(opinion_id,cluster_id,status,progress,stage,error,result_json,provider,model,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(opinion_id) DO UPDATE SET
        cluster_id=excluded.cluster_id,
        status=excluded.status,
        progress=excluded.progress,
        stage=excluded.stage,
        error=excluded.error,
        result_json=COALESCE(excluded.result_json,case_analysis.result_json),
        provider=COALESCE(excluded.provider,case_analysis.provider),
        model=COALESCE(excluded.model,case_analysis.model),
        updated_at=excluded.updated_at
    `).run(
      input.opinionId,
      input.clusterId,
      input.status,
      Math.max(0, Math.min(100, Math.round(input.progress))),
      input.stage.slice(0, 500),
      input.error?.slice(0, 2_000) ?? null,
      input.analysis ? JSON.stringify(input.analysis) : null,
      input.provider ?? input.analysis?.provider ?? null,
      input.model ?? input.analysis?.model ?? null,
      new Date().toISOString(),
    );
  }

  getAnalysisState(opinionId: number): StoredAnalysisState | null {
    const row = this.db.prepare(`
      SELECT opinion_id AS opinionId, cluster_id AS clusterId, status, progress, stage, error,
             result_json AS resultJson, provider, model, updated_at AS updatedAt
      FROM case_analysis WHERE opinion_id=?
    `).get(opinionId) as (Omit<StoredAnalysisState, "analysis"> & { resultJson: string | null }) | undefined;
    if (!row) return null;
    const { resultJson, ...rest } = row;
    return { ...rest, analysis: resultJson ? JSON.parse(resultJson) as CaseAnalysis : null };
  }

  close(): void {
    this.db.close();
  }
}
