// Giam thi nhap MAT KHAU DE (mat khau chung PROCTOR_PASSWORD hoac ma rieng 6 so cua de) de:
//   - thi sinh thoat khan cap (THOAT_KHAN_CAP) / thoat ung dung sau khi nop (THOAT_UNG_DUNG)
//   - mo khoa bai thi bi khoa vi roi trang nhieu lan (MO_KHOA)
//   - cho thi sinh lam lai them 1 luot (CHO_LAM_LAI)
// Dung / sai deu ghi vao exam_events. Thoat khan cap xong thi sinh ve danh sach de (khong dong app / SEB).
// THOAT (khan cap / ung dung): luot 1..FREE_RETAKE_ATTEMPTS nhan mat khau mac dinh hoac ma rieng cua de;
// tu luot tiep theo (luot thu 4) CHI nhan mat khau mac dinh PROCTOR_PASSWORD.
import type { Config } from "../config.ts";
import { ConflictError, UnauthorizedError, ValidationError } from "../errors.ts";
import type { EventStore } from "../repositories/EventRepository.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import type { RateLimiter } from "../security/RateLimiter.ts";
import { matchesExamPassword } from "../security/examPassword.ts";
import type { EventType, ExamRow, UntrustedBody } from "../types.ts";
import { cleanLogs, cleanString, isId } from "../utils/input.ts";
import { FREE_RETAKE_ATTEMPTS, type AttemptService } from "./AttemptService.ts";

type ExitType = Extract<EventType, "THOAT_KHAN_CAP" | "THOAT_UNG_DUNG" | "MO_KHOA">;
const EXIT_TYPES: readonly ExitType[] = ["THOAT_KHAN_CAP", "THOAT_UNG_DUNG", "MO_KHOA"];
const isExitType = (v: unknown): v is ExitType => EXIT_TYPES.includes(v as ExitType);

const ACTION_LABEL: Record<Exclude<EventType, "SAI_MAT_KHAU">, string> = {
  THOAT_KHAN_CAP: "thoát khẩn cấp",
  THOAT_UNG_DUNG: "thoát ứng dụng",
  CHO_LAM_LAI: "cho làm lại",
  MO_KHOA: "mở khoá bài thi"
};

export interface ProctorServiceDeps {
  config: Config;
  exams: ExamStore;
  events: EventStore;
  attempts: AttemptService;
  limiter: RateLimiter;
  // Chong do mat khau theo may (IP), dung chung voi EntryPasswordService: 1 mat khau cho moi de
  // nen doi ten thi sinh / doi de cung khong duoc them luot do
  ipLimiter?: RateLimiter;
}

interface Target {
  exam: ExamRow | null;
  base: { exam_id: number | null; exam_title: string | null; student_name: string };
  lockKey: string;
  ip: string;
}

export class ProctorService {
  private readonly config: Config;
  private readonly exams: ExamStore;
  private readonly events: EventStore;
  private readonly attempts: AttemptService;
  private readonly limiter: RateLimiter;
  private readonly ipLimiter?: RateLimiter;

  constructor({ config, exams, events, attempts, limiter, ipLimiter }: ProctorServiceDeps) {
    this.ipLimiter = ipLimiter;
    this.config = config;
    this.exams = exams;
    this.events = events;
    this.attempts = attempts;
    this.limiter = limiter;
  }

  // payload: { password, type, student_name, exam_id, detail, action_logs }
  async authorizeExit(payload: UntrustedBody, clientIp: string): Promise<{ ok: true }> {
    const type: ExitType = isExitType(payload.type) ? payload.type : "THOAT_UNG_DUNG";
    const target = await this.target(payload, clientIp);
    await this.verify(target, payload.password, type);
    await this.events.create({ ...target.base, type, detail: cleanString(payload.detail, 1000), action_logs: cleanLogs(payload.action_logs) });
    return { ok: true };
  }

  // Cho thi sinh lam them 1 luot. payload: { password, student_name, exam_id }
  async grantRetake(payload: UntrustedBody, clientIp: string): Promise<{ ok: true; attempt: number }> {
    const target = await this.target(payload, clientIp);
    if (!target.exam) throw new ValidationError("Thiếu mã đề.");
    if (!cleanString(payload.student_name)) throw new ValidationError("Thiếu tên thí sinh.");

    const status = await this.attempts.status(target.exam, target.base.student_name);
    // Con luot chua dung (vd: vua duoc cho lam lai roi tai lai trang / de cho lam lai nhieu lan) -> khong cap them
    if (status.canStart) throw new ConflictError("Thí sinh vẫn còn lượt làm bài, không cần nhập mật khẩu.");

    await this.verify(target, payload.password, "CHO_LAM_LAI");
    // Mo dung 1 luot tinh tu so lan da nop (khong phai so luot da cap)
    const attempt = status.used + 1;
    await this.events.create({ ...target.base, type: "CHO_LAM_LAI", detail: `Giám thị cho làm lại: lượt thứ ${attempt}.`, action_logs: [], attempt });
    return { ok: true, attempt };
  }

  private async target(payload: UntrustedBody, clientIp: string): Promise<Target> {
    const student = cleanString(payload.student_name);
    const exam = isId(payload.exam_id) ? await this.exams.findById(String(payload.exam_id)) : null;
    return {
      exam,
      base: { exam_id: exam?.id ?? null, exam_title: exam?.title ?? null, student_name: student || "(không rõ)" },
      lockKey: `${clientIp}:${student}`,
      ip: clientIp
    };
  }

  // Thoat khi dang lam luot thu (FREE_RETAKE_ATTEMPTS + 1) tro di -> khong nhan ma rieng cua de
  private async ownCodeAllowed(target: Target, action: Exclude<EventType, "SAI_MAT_KHAU">): Promise<boolean> {
    if (action !== "THOAT_KHAN_CAP" && action !== "THOAT_UNG_DUNG") return true;
    if (!target.exam) return false;
    const { used } = await this.attempts.status(target.exam, target.base.student_name);
    return used + 1 <= FREE_RETAKE_ATTEMPTS; // luot dang lam = so lan da nop + 1
  }

  private async verify(target: Target, password: unknown, action: Exclude<EventType, "SAI_MAT_KHAU">): Promise<void> {
    const ipKey = `pw:${target.ip}`;
    this.ipLimiter?.assertNotLocked(ipKey);
    this.limiter.assertNotLocked(target.lockKey);
    // Mat khau mac dinh luon dung duoc. Ma rieng cua dung de nay: dung duoc tru khi THOAT tu luot thu 4
    const ownCodeAllowed = await this.ownCodeAllowed(target, action);
    if (matchesExamPassword(cleanString(password, 100), ownCodeAllowed ? target.exam : null, this.config.proctorPassword)) {
      this.limiter.reset(target.lockKey);
      this.ipLimiter?.reset(ipKey);
      return;
    }
    this.ipLimiter?.recordFailure(ipKey);
    const left = this.limiter.recordFailure(target.lockKey);
    // Ghi su co sai ma; loi ghi khong duoc lam lech thong bao cho giam thi
    await this.events.create({
      ...target.base,
      type: "SAI_MAT_KHAU",
      detail: `Nhập sai mật khẩu đề khi ${ACTION_LABEL[action]}.`,
      action_logs: []
    }).catch(() => { });
    throw new UnauthorizedError(left ? `Mật khẩu đề không đúng! Còn ${left} lần thử.` : `Mật khẩu đề không đúng! Đã tạm khoá ${this.limiter.lockMinutes} phút.`);
  }
}
