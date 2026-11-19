// Mat khau vao de: moi de bat / tat rieng (mac dinh tat).
//  - Bat: hoc sinh nhap mat khau 6 so (giam thi doc khi phat de) moi lay duoc de / nop duoc bai.
//  - Nhap dung -> server cap "ve vao de" (HMAC theo de + thi sinh + mat khau hien tai). Tai lai trang / vao lai
//    sau khi thoat khan cap dung ve, khong phai nhap lai. Admin doi mat khau -> moi ve cu het hieu luc.
//  - Sai: dem so lan (khoa tam), ghi su co SAI_MAT_KHAU de admin thay.
import crypto from "node:crypto";
import type { Config } from "../config.ts";
import { NotFoundError, UnauthorizedError, ValidationError } from "../errors.ts";
import type { EventStore } from "../repositories/EventRepository.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import { generateProctorCode } from "../security/proctorCode.ts";
import type { RateLimiter } from "../security/RateLimiter.ts";
import { secureCompare } from "../security/secureCompare.ts";
import type { EntryCredentials, ExamRow } from "../types.ts";
import { cleanString, isId } from "../utils/input.ts";

export interface EntrySettings {
  exam_id: number;
  enabled: boolean;
  password: string | null;
}

export interface EntryPasswordServiceDeps {
  config: Config;
  exams: ExamStore;
  events: EventStore;
  limiter: RateLimiter;
  generate?: () => string;
}

export class EntryPasswordService {
  private readonly config: Config;
  private readonly exams: ExamStore;
  private readonly events: EventStore;
  private readonly limiter: RateLimiter;
  private readonly generate: () => string;

  constructor({ config, exams, events, limiter, generate = generateProctorCode }: EntryPasswordServiceDeps) {
    this.config = config;
    this.exams = exams;
    this.events = events;
    this.limiter = limiter;
    this.generate = generate;
  }

  // ---------------------------------------------------------- Admin
  // enabled: bat / tat; regenerate: doi mat khau moi. Bat lan dau -> tu tao mat khau.
  async settings(examId: unknown, { enabled, regenerate = false }: { enabled?: boolean; regenerate?: boolean } = {}): Promise<EntrySettings> {
    if (!isId(examId)) throw new ValidationError("Mã đề không hợp lệ.");
    const exam = await this.exams.findById(String(examId));
    if (!exam) throw new NotFoundError("Không tìm thấy đề thi.");
    const patch: Partial<ExamRow> = {};
    if (typeof enabled === "boolean" && enabled !== !!exam.require_password) patch.require_password = enabled;
    const willEnable = patch.require_password ?? !!exam.require_password;
    if (regenerate || (willEnable && !exam.entry_password)) {
      let password = this.generate();
      if (password === exam.entry_password) password = this.generate();
      patch.entry_password = password;
    }
    if (Object.keys(patch).length) await this.exams.update(exam.id, patch);
    const merged = { ...exam, ...patch };
    return { exam_id: exam.id, enabled: !!merged.require_password, password: merged.entry_password ?? null };
  }

  // ---------------------------------------------------------- Thi sinh
  // De khong bat mat khau -> null. Ve hop le / mat khau dung -> tra ve vao de. Con lai -> 401 (needsPassword).
  async admit(exam: ExamRow, studentName: string, entry?: EntryCredentials): Promise<string | null> {
    if (!exam.require_password) return null;
    if (!exam.entry_password) throw new UnauthorizedError("Đề này chưa đặt mật khẩu vào đề. Báo quản trị viên.");
    const token = this.tokenFor(exam, studentName);
    if (entry?.token && secureCompare(entry.token, token)) return token;

    const password = cleanString(entry?.password, 100);
    if (!password) throw new UnauthorizedError("Đề này cần mật khẩu. Hỏi giám thị phòng thi.", { needsPassword: true });

    const lockKey = `entry:${entry?.ip ?? ""}:${exam.id}:${studentName}`;
    this.limiter.assertNotLocked(lockKey);
    if (secureCompare(password, exam.entry_password)) {
      this.limiter.reset(lockKey);
      return token;
    }
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
    if (!exam.entry_password || typeof token !== "string" || !secureCompare(token, this.tokenFor(exam, studentName))) {
      throw new UnauthorizedError("Phiên vào đề không hợp lệ (mật khẩu đề đã đổi?). Hỏi giám thị mật khẩu rồi vào lại.", { needsPassword: true });
    }
  }

  private tokenFor(exam: ExamRow, studentName: string): string {
    return crypto.createHmac("sha256", this.config.sessionSecret)
      .update(`entry:${exam.id}:${studentName}:${exam.entry_password ?? ""}`)
      .digest("base64url").slice(0, 32);
  }
}
