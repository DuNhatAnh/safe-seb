// Truy van bang exam_events - su co phong thi (qua interface Database, khong biet Supabase)
import type { Database } from "../infra/database/Database.ts";
import type { EventType, NewEvent } from "../types.ts";

export interface EventStore {
  create(event: NewEvent): Promise<unknown>;
  // So su co loai `type` cua thi sinh trong de (vd: so lan duoc cho lam lai)
  count(examId: number, studentName: string, type: EventType): Promise<number>;
}

export class EventRepository implements EventStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  create(event: NewEvent): Promise<unknown> {
    return this.db.insert("exam_events", event);
  }

  async count(examId: number, studentName: string, type: EventType): Promise<number> {
    const rows = await this.db.select("exam_events", { columns: ["id"], filter: { exam_id: examId, student_name: studentName, type } });
    return rows.length;
  }
}
