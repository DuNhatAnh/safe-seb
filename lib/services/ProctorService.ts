// Giam thi nhap ma 6 so cua de (admin xem / doi o trang quan tri) de:
//   - thi sinh thoat khan cap (THOAT_KHAN_CAP) / thoat ung dung sau khi nop (THOAT_UNG_DUNG)
//   - mo khoa bai thi bi khoa vi roi trang nhieu lan (MO_KHOA)
//   - cho thi sinh lam lai them 1 luot (CHO_LAM_LAI)
// Dung / sai deu ghi vao exam_events. De cu chua co ma -> chap nhan PROCTOR_PASSWORD trong .env.
import type { Config } from "../config.ts";
import { ConflictError, UnauthorizedError, ValidationError } from "../errors.ts";
import type { EventStore } from "../repositories/EventRepository.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import type { RateLimiter } from "../security/RateLimiter.ts";
import { secureCompare } from "../security/secureCompare.ts";
import type { ClientInfo, EventType, ExamRow, UntrustedBody } from "../types.ts";
import { cleanLogs, cleanString, isId } from "../utils/input.ts";
import type { AttemptService } from "./AttemptService.ts";

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
  // Trang thoat SEB cua de (SebConfigService.quitUrl): dang chay trong SEB thi tra ve de app mo -> SEB tu dong
  sebQuitUrl?: (examId: number, origin: string) => string;
}

interface Target {
  exam: ExamRow | null;
  base: { exam_id: number | null; exam_title: string | null; student_name: string };
  lockKey: string;
}

export class ProctorService {
  private readonly config: Config;
  private readonly exams: ExamStore;
  private readonly events: EventStore;
  private readonly attempts: AttemptService;
  private readonly limiter: RateLimiter;
  private readonly sebQuitUrl?: (examId: number, origin: string) => string;

  constructor({ config, exams, events, attempts, limiter, sebQuitUrl }: ProctorServiceDeps) {
    this.sebQuitUrl = sebQuitUrl;
    this.config = config;
    this.exams = exams;
    this.events = events;
    this.attempts = attempts;
    this.limiter = limiter;
  }

  // payload: { password, type, student_name, exam_id, detail, action_logs }
  async authorizeExit(payload: UntrustedBody, clientIp: string, client?: ClientInfo): Promise<{ ok: true; seb_quit_url?: string }> {
    const type: ExitType = isExitType(payload.type) ? payload.type : "THOAT_UNG_DUNG";
    const target = await this.target(payload, clientIp);
    await this.verify(target, payload.password, type);
    await this.events.create({ ...target.base, type, detail: cleanString(payload.detail, 1000), action_logs: cleanLogs(payload.action_logs) });
    // Thoat (khong phai mo khoa) trong SEB -> tra trang thoat SEB de app mo, SEB tu dong
    const quit = type !== "MO_KHOA" && client?.isSeb && target.exam && this.sebQuitUrl ? this.sebQuitUrl(target.exam.id, client.origin) : undefined;
    return quit ? { ok: true, seb_quit_url: quit } : { ok: true };
  }

  // Cho thi sinh lam them 1 luot. payload: { password, student_name, exam_id }
  async grantRetake(payload: UntrustedBody, clientIp: string): Promise<{ ok: true; attempt: number }> {
    const target = await this.target(payload, clientIp);
    if (!target.exam) throw new ValidationError("Thiếu mã đề.");
    if (!cleanString(payload.student_name)) throw new ValidationError("Thiếu tên thí sinh.");

    const status = await this.attempts.status(target.exam.id, target.base.student_name);
    // Con luot chua dung (vd: vua duoc cho lam lai roi tai lai trang) -> khong cap them
    if (status.canStart) throw new ConflictError("Thí sinh vẫn còn lượt làm bài, không cần nhập mã.");

    await this.verify(target, payload.password, "CHO_LAM_LAI");
    const attempt = status.allowed + 1;
    await this.events.create({ ...target.base, type: "CHO_LAM_LAI", detail: `Giám thị cho làm lại: lượt thứ ${attempt}.`, action_logs: [] });
    return { ok: true, attempt };
  }

  private async target(payload: UntrustedBody, clientIp: string): Promise<Target> {
    const student = cleanString(payload.student_name);
    const exam = isId(payload.exam_id) ? await this.exams.findById(String(payload.exam_id)) : null;
    return {
      exam,
      base: { exam_id: exam?.id ?? null, exam_title: exam?.title ?? null, student_name: student || "(không rõ)" },
      lockKey: `${clientIp}:${student}`
    };
  }

  // Ma cua de neu de da co ma; de cu (chua co ma) / khong ro de -> mat khau chung trong .env
  private expectedCode(exam: ExamRow | null): string {
    return exam?.proctor_code || this.config.proctorPassword;
  }

  private async verify(target: Target, password: unknown, action: Exclude<EventType, "SAI_MAT_KHAU">): Promise<void> {
    this.limiter.assertNotLocked(target.lockKey);
    if (secureCompare(cleanString(password, 100), this.expectedCode(target.exam))) {
      this.limiter.reset(target.lockKey);
      return;
    }
    const left = this.limiter.recordFailure(target.lockKey);
    // Ghi su co sai ma; loi ghi khong duoc lam lech thong bao cho giam thi
    await this.events.create({
      ...target.base,
      type: "SAI_MAT_KHAU",
      detail: `Nhập sai mã giám thị khi ${ACTION_LABEL[action]}.`,
      action_logs: []
    }).catch(() => { });
    throw new UnauthorizedError(left ? `Mã giám thị không đúng! Còn ${left} lần thử.` : `Mã giám thị không đúng! Đã tạm khoá ${this.limiter.lockMinutes} phút.`);
  }
}
