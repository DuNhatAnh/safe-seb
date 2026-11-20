// Quy tac luot lam bai:
//  - Mac dinh: moi thi sinh duoc 1 luot / de. Het luot -> giam thi nhap mat khau de "cho lam lai"
//    (su co CHO_LAM_LAI, ghi attempt = so lan da nop + 1) -> mo them DUNG 1 luot tinh tu so lan da nop.
//  - De bat allow_retake: duoc lam toi da FREE_RETAKE_ATTEMPTS luot khong can mat khau; tu luot tiep theo
//    giam thi nhap mat khau de (moi lan mo them 1 luot, nhu mac dinh).
//  - Ve luot: luc cho vao de, server cap ve = HMAC(de, thi sinh, so lan da nop). Con ve hop le (chua nop them
//    bai nao) thi luot dang lam van tai lai / nop duoc, du admin doi cai dat giua chung (vd tat allow_retake).
//    Nop xong so lan da nop tang -> ve het han, nen khong dung ve de nop vo han duoc.
import crypto from "node:crypto";
import type { EventStore } from "../repositories/EventRepository.ts";
import type { ResultStore } from "../repositories/ResultRepository.ts";
import { secureCompare } from "../security/secureCompare.ts";
import type { ExamRow, ResultSummaryRow } from "../types.ts";

// De bat "cho lam lai": so luot (tinh ca lan dau) duoc lam khong can mat khau
export const FREE_RETAKE_ATTEMPTS = 3;

export interface AttemptStatus {
  used: number;                         // so lan da nop
  allowed: number;                      // so luot duoc phep
  canStart: boolean;                    // con luot chua lam
  latest: ResultSummaryRow | null;      // lan nop gan nhat
}

export interface AttemptServiceDeps {
  results: ResultStore;
  events: EventStore;
  // Khoa ky ve luot (SESSION_SECRET). Khong co -> khong cap ve (giu quy tac cu)
  ticketSecret?: () => string;
}

export class AttemptService {
  private readonly results: ResultStore;
  private readonly events: EventStore;
  private readonly ticketSecret?: () => string;

  constructor({ results, events, ticketSecret }: AttemptServiceDeps) {
    this.results = results;
    this.events = events;
    this.ticketSecret = ticketSecret;
  }

  async status(exam: Pick<ExamRow, "id" | "allow_retake">, studentName: string): Promise<AttemptStatus> {
    const [submitted, grants] = await Promise.all([
      this.results.listByExamAndStudent(exam.id, studentName),
      this.events.retakeGrants(exam.id, studentName)
    ]);
    // Su co cu (attempt null): moi lan +1 luot. Su co moi: mo toi dung luot da ghi
    // (2 lan cho lam lai cung luc cung ghi 1 so luot -> chi mo 1 luot).
    const legacy = grants.filter(a => a === null).length;
    const free = exam.allow_retake ? FREE_RETAKE_ATTEMPTS : 1;
    const allowed = Math.max(free, 1 + legacy, ...grants.map(a => a ?? 0));
    return { used: submitted.length, allowed, canStart: submitted.length < allowed, latest: submitted[0] ?? null };
  }

  // Ve cho luot dang vao: hop le toi khi thi sinh nop them 1 bai
  ticketFor(examId: number, studentName: string, used: number): string | null {
    if (!this.ticketSecret) return null;
    return crypto.createHmac("sha256", this.ticketSecret()).update(`attempt:${examId}:${studentName}:${used}`).digest("base64url").slice(0, 32);
  }

  isValidTicket(examId: number, studentName: string, used: number, ticket: unknown): boolean {
    const expected = this.ticketFor(examId, studentName, used);
    return !!expected && typeof ticket === "string" && secureCompare(ticket, expected);
  }
}
