// Truy van bang exam_events - su co phong thi (qua interface Database, khong biet Supabase)
import type { Database } from "../infra/database/Database.ts";
import type { NewEvent } from "../types.ts";

export interface EventStore {
  create(event: NewEvent): Promise<unknown>;
  // Cac lan giam thi cho thi sinh lam lai de nay: so thu tu luot duoc mo (su co cu: null)
  retakeGrants(examId: number, studentName: string): Promise<(number | null)[]>;
}

export class EventRepository implements EventStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  create(event: NewEvent): Promise<unknown> {
    return this.db.insert("exam_events", event);
  }

  async retakeGrants(examId: number, studentName: string): Promise<(number | null)[]> {
    const rows = await this.db.select<{ attempt?: number | null }>("exam_events", {
      columns: ["id", "attempt"],
      filter: { exam_id: examId, student_name: studentName, type: "CHO_LAM_LAI" }
    });
    return rows.map(r => (r.attempt == null ? null : Number(r.attempt)));
  }
}
