// De thi phia thi sinh: danh sach, lay de da loc dap an
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import type { ClientInfo, EntryCredentials, ExamRow, ExamSummary, StudentQuestion } from "../types.ts";
import { isId } from "../utils/input.ts";
import type { AttemptService } from "./AttemptService.ts";
import type { EntryPasswordService } from "./EntryPasswordService.ts";
import type { GradingService } from "./GradingService.ts";

export interface StudentExam {
  id: number;
  title: string;
  duration_minutes: number | null;
  questions: StudentQuestion[];
  entry_token?: string; // de co mat khau: ve vao de (gui lai khi tai lai trang / nop bai)
}

export interface ExamServiceDeps {
  exams: ExamStore;
  attempts: AttemptService;
  grading: GradingService;
  entryPasswords?: EntryPasswordService;
}

export class ExamService {
  private readonly exams: ExamStore;
  private readonly attempts: AttemptService;
  private readonly grading: GradingService;
  readonly entryPasswords?: EntryPasswordService;

  constructor({ exams, attempts, grading, entryPasswords }: ExamServiceDeps) {
    this.entryPasswords = entryPasswords;
    this.exams = exams;
    this.attempts = attempts;
    this.grading = grading;
  }

  listExams(): Promise<ExamSummary[]> {
    return this.exams.listSummaries();
  }

  // De day du (kem dap an) - chi dung noi bo server
  async getExamOrThrow(id: unknown): Promise<ExamRow> {
    if (!isId(id)) throw new ValidationError("Mã đề không hợp lệ.");
    const exam = await this.exams.findById(String(id));
    if (!exam) throw new NotFoundError("Không tìm thấy đề thi.");
    return exam;
  }

  // De bat buoc Safe Exam Browser: trinh duyet thuong khong lay de / nop bai duoc
  assertClientAllowed(exam: ExamRow, client?: ClientInfo): void {
    if (exam.require_seb && !client?.isSeb) {
      throw new ForbiddenError("Đề này bắt buộc làm trên Safe Exam Browser.", { needsSeb: true });
    }
  }

  // De gui cho thi sinh: bo dap an (va ma giam thi). Het luot -> phai nho giam thi nhap ma cho lam lai.
  // Thu tu kiem tra: SEB -> con luot lam bai -> mat khau vao de (neu de bat)
  async getExamForStudent(id: unknown, studentName: string, client?: ClientInfo, entry?: EntryCredentials): Promise<StudentExam> {
    const exam = await this.getExamOrThrow(id);
    this.assertClientAllowed(exam, client);
    if (studentName && !(await this.attempts.status(exam.id, studentName)).canStart) {
      throw new ConflictError("Bạn đã nộp bài thi này rồi. Muốn làm lại cần giám thị nhập mã.", { needsProctor: true });
    }
    const token = this.entryPasswords ? await this.entryPasswords.admit(exam, studentName, entry) : null;
    return {
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.duration_minutes,
      questions: (exam.questions ?? []).map(q => this.grading.sanitizeQuestion(q)),
      ...(token ? { entry_token: token } : {})
    };
  }
}
