// Quy tac luot lam bai: moi thi sinh duoc 1 luot / de, moi lan giam thi nhap dung ma
// "cho lam lai" (su co CHO_LAM_LAI) thi duoc them 1 luot.
import type { EventStore } from "../repositories/EventRepository.ts";
import type { ResultStore } from "../repositories/ResultRepository.ts";
import type { ResultSummaryRow } from "../types.ts";

export interface AttemptStatus {
  used: number;                         // so lan da nop
  allowed: number;                      // so luot duoc phep
  canStart: boolean;                    // con luot chua lam
  latest: ResultSummaryRow | null;      // lan nop gan nhat
}

export interface AttemptServiceDeps {
  results: ResultStore;
  events: EventStore;
}

export class AttemptService {
  private readonly results: ResultStore;
  private readonly events: EventStore;

  constructor({ results, events }: AttemptServiceDeps) {
    this.results = results;
    this.events = events;
  }

  async status(examId: number, studentName: string): Promise<AttemptStatus> {
    const [submitted, grants] = await Promise.all([
      this.results.listByExamAndStudent(examId, studentName),
      this.events.count(examId, studentName, "CHO_LAM_LAI")
    ]);
    const allowed = 1 + grants;
    return { used: submitted.length, allowed, canStart: submitted.length < allowed, latest: submitted[0] ?? null };
  }
}
