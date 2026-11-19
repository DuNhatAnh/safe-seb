// Truy van bang exams (qua interface Database, khong biet Supabase)
import type { Database } from "../infra/database/Database.ts";
import type { ExamRow, ExamSummary } from "../types.ts";

// Cot gui cho danh sach de: KHONG co questions (chua dap an) va proctor_code
const SUMMARY_COLUMNS = ["id", "title", "duration_minutes", "assigned_to", "require_seb", "require_password", "created_at"] as const;

export interface ExamStore {
  listSummaries(): Promise<ExamSummary[]>;
  findById(id: number | string): Promise<ExamRow | null>;
  setProctorCode(id: number, code: string): Promise<void>;
  update(id: number, patch: Partial<ExamRow>): Promise<void>;
}

export class ExamRepository implements ExamStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  listSummaries(): Promise<ExamSummary[]> {
    return this.db.select<ExamSummary>("exams", { columns: SUMMARY_COLUMNS, orderBy: { column: "id", ascending: false } });
  }

  async findById(id: number | string): Promise<ExamRow | null> {
    const rows = await this.db.select<ExamRow>("exams", { filter: { id: Number(id) }, limit: 1 });
    return rows[0] ?? null;
  }

  async setProctorCode(id: number, code: string): Promise<void> {
    await this.update(id, { proctor_code: code });
  }

  async update(id: number, patch: Partial<ExamRow>): Promise<void> {
    await this.db.update("exams", { id }, patch);
  }
}
