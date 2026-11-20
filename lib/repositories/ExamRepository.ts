// Truy van bang exams (qua interface Database, khong biet Supabase)
import type { Database } from "../infra/database/Database.ts";
import type { ExamRow, ExamSummary } from "../types.ts";

// Cot gui cho danh sach de: KHONG co questions (chua dap an) va proctor_code
const SUMMARY_COLUMNS = ["id", "title", "duration_minutes", "assigned_to", "require_seb", "require_password", "created_at"] as const;

export interface ExamStore {
  // 1 trang danh sach de, moi tao truoc; q: tim theo ten de
  page(options: { q?: string; offset: number; limit: number }): Promise<{ items: ExamSummary[]; total: number }>;
  findById(id: number | string): Promise<ExamRow | null>;
  // Ten de theo ma (lich su lam bai)
  titles(ids: number[]): Promise<Map<number, string>>;
  setProctorCode(id: number, code: string): Promise<void>;
  update(id: number, patch: Partial<ExamRow>): Promise<void>;
}

export class ExamRepository implements ExamStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async page({ q, offset, limit }: { q?: string; offset: number; limit: number }): Promise<{ items: ExamSummary[]; total: number }> {
    const search = q ? { column: "title", term: q } : undefined;
    const [items, total] = await Promise.all([
      this.db.select<ExamSummary>("exams", { columns: SUMMARY_COLUMNS, search, orderBy: { column: "created_at", ascending: false }, offset, limit }),
      this.db.count("exams", { search })
    ]);
    return { items, total };
  }

  async titles(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db.select<{ id: number; title: string }>("exams", { columns: ["id", "title"], filter: { id: [...new Set(ids)] } });
    return new Map(rows.map(r => [Number(r.id), r.title]));
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
