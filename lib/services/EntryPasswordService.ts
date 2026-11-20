// Mat khau vao de: moi de bat / tat rieng (mac dinh tat).
//  - Bat: hoc sinh nhap mat khau de (mat khau chung PROCTOR_PASSWORD hoac ma rieng 6 so cua de) moi lay duoc de / nop duoc bai.
//  - Nhap dung -> server cap "ve vao de" (HMAC theo de + thi sinh + mat khau hien tai). Tai lai trang / vao lai
//    sau khi thoat khan cap dung ve, khong phai nhap lai. Doi PROCTOR_PASSWORD -> ve cu het hieu luc.
//    Doi ma rieng cua de KHONG lam ve het han (de hoc sinh dang lam bai van nop duoc).
//  - Sai: dem so lan (khoa tam), ghi su co SAI_MAT_KHAU de admin thay.
import crypto from "node:crypto";
import type { Config } from "../config.ts";
import { NotFoundError, UnauthorizedError, ValidationError } from "../errors.ts";
import type { EventStore } from "../repositories/EventRepository.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import type { RateLimiter } from "../security/RateLimiter.ts";
import { matchesExamPassword } from "../security/examPassword.ts";
import { secureCompare } from "../security/secureCompare.ts";
import type { EntryCredentials, ExamRow } from "../types.ts";
import { cleanString, isId } from "../utils/input.ts";

export interface EntrySettings {
  exam_id: number;
  enabled: boolean;
}

export interface EntryPasswordServiceDeps {
  config: Config;
  exams: ExamStore;
  events: EventStore;
  limiter: RateLimiter;
  // Chong do theo may (IP), dung chung voi ProctorService
  ipLimiter?: RateLimiter;
}

export class EntryPasswordService {
  private readonly config: Config;
  private readonly exams: ExamStore;
  private readonly events: EventStore;
  private readonly limiter: RateLimiter;
  private readonly ipLimiter?: RateLimiter;

  constructor({ config, exams, events, limiter, ipLimiter }: EntryPasswordServiceDeps) {
    this.ipLimiter = ipLimiter;
    this.config = config;
    this.exams = exams;
    this.events = events;
    this.limiter = limiter;
  }

  // ---------------------------------------------------------- Admin
  // enabled: bat / tat mat khau vao de (nhan mat khau chung hoac ma rieng cua de)
  async settings(examId: unknown, { enabled }: { enabled?: boolean } = {}): Promise<EntrySettings> {
    if (!isId(examId)) throw new ValidationError("Mã đề không hợp lệ.");
    const exam = await this.exams.findById(String(examId));
    if (!exam) throw new NotFoundError("Không tìm thấy đề thi.");
    if (typeof enabled === "boolean" && enabled !== !!exam.require_password) {
      await this.exams.update(exam.id, { require_password: enabled });
      return { exam_id: exam.id, enabled };
    }
    return { exam_id: exam.id, enabled: !!exam.require_password };
  }

  // ---------------------------------------------------------- Thi sinh
  // De khong bat mat khau -> null. Ve hop le / mat khau dung -> tra ve vao de. Con lai -> 401 (needsPassword).
  async admit(exam: ExamRow, studentName: string, entry?: EntryCredentials): Promise<string | null> {
    if (!exam.require_password) return null;
    const token = this.tokenFor(exam, studentName);
    if (entry?.token && secureCompare(entry.token, token)) return token;

    const password = cleanString(entry?.password, 100);
    if (!password) throw new UnauthorizedError("Đề này cần mật khẩu. Hỏi giám thị phòng thi.", { needsPassword: true });

    const lockKey = `entry:${entry?.ip ?? ""}:${exam.id}:${studentName}`;
    const ipKey = `pw:${entry?.ip ?? ""}`;
    this.ipLimiter?.assertNotLocked(ipKey);
    this.limiter.assertNotLocked(lockKey);
    if (matchesExamPassword(password, exam, this.config.proctorPassword)) {
      this.limiter.reset(lockKey);
      this.ipLimiter?.reset(ipKey);
      return token;
    }
    this.ipLimiter?.recordFailure(ipKey);
    const left = this.limiter.recordFailure(lockKey);
    await this.events.create({
      exam_id: exam.id, exam_title: exam.title, student_name: studentName || "(không rõ)",
      type: "SAI_MAT_KHAU", detail: "Nhập sai mật khẩu vào đề.", action_logs: []
    }).catch(() => { });
    throw new UnauthorizedError(left ? `Mật khẩu đề không đúng! Còn ${left} lần thử.` : `Mật khẩu đề không đúng! Đã tạm khoá ${this.limiter.lockMinutes} phút.`, { needsPassword: true });
  }

  // Nop bai: de co mat khau phai kem ve hop le (khong nhan mat khau o day)
  assertToken(exam: ExamRow, studentName: string, token: unknown): void {
    if (!exam.require_password) return;
    if (typeof token !== "string" || !secureCompare(token, this.tokenFor(exam, studentName))) {
      throw new UnauthorizedError("Phiên vào đề không hợp lệ (mật khẩu đề đã đổi?). Hỏi giám thị mật khẩu rồi vào lại.", { needsPassword: true });
    }
  }

  private tokenFor(exam: ExamRow, studentName: string): string {
    return crypto.createHmac("sha256", this.config.sessionSecret)
      .update(`entry:${exam.id}:${studentName}:${this.config.proctorPassword}`)
      .digest("base64url").slice(0, 32);
  }
}
