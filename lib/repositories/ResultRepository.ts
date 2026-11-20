// Truy van bang exam_results (qua interface Database, khong biet Supabase)
import type { Database } from "../infra/database/Database.ts";
import type { NewResult, ResultRow, ResultSummaryRow } from "../types.ts";

const SUMMARY_COLUMNS = ["id", "exam_id", "score", "answers", "duration_minutes", "submitted_at"] as const;
const NEWEST_FIRST = { column: "id", ascending: false };

export interface ResultStore {
  listByStudent(studentName: string): Promise<ResultSummaryRow[]>;
  // 1 trang lich su lam bai, moi nhat truoc
  pageByStudent(studentName: string, offset: number, limit: number): Promise<{ items: ResultSummaryRow[]; total: number }>;
  // Cac lan nop cua thi sinh trong nhung de nay (de danh dau "da nop" tren 1 trang danh sach de)
  listByStudentForExams(studentName: string, examIds: number[]): Promise<ResultSummaryRow[]>;
  // Moi lan nop cua thi sinh cho de nay, moi nhat truoc
  listByExamAndStudent(examId: number, studentName: string): Promise<ResultSummaryRow[]>;
  create(result: NewResult): Promise<ResultRow>;
}

export class ResultRepository implements ResultStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  listByExamAndStudent(examId: number, studentName: string): Promise<ResultSummaryRow[]> {
    return this.db.select<ResultSummaryRow>("exam_results", {
      columns: SUMMARY_COLUMNS,
      filter: { exam_id: examId, student_name: studentName },
      orderBy: NEWEST_FIRST
    });
  }

  async pageByStudent(studentName: string, offset: number, limit: number): Promise<{ items: ResultSummaryRow[]; total: number }> {
    const filter = { student_name: studentName };
    const [items, total] = await Promise.all([
      this.db.select<ResultSummaryRow>("exam_results", { columns: SUMMARY_COLUMNS, filter, orderBy: NEWEST_FIRST, offset, limit }),
      this.db.count("exam_results", { filter })
    ]);
    return { items, total };
  }

  listByStudentForExams(studentName: string, examIds: number[]): Promise<ResultSummaryRow[]> {
    if (!examIds.length) return Promise.resolve([]);
    return this.db.select<ResultSummaryRow>("exam_results", {
      columns: SUMMARY_COLUMNS,
      filter: { student_name: studentName, exam_id: examIds },
      orderBy: NEWEST_FIRST
    });
  }

  listByStudent(studentName: string): Promise<ResultSummaryRow[]> {
    return this.db.select<ResultSummaryRow>("exam_results", { columns: SUMMARY_COLUMNS, filter: { student_name: studentName }, orderBy: NEWEST_FIRST });
  }

  create(result: NewResult): Promise<ResultRow> {
    return this.db.insert<ResultRow>("exam_results", result);
  }
}
