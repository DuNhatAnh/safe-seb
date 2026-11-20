// De thi phia thi sinh: danh sach, lay de da loc dap an
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.ts";
import type { Page } from "../infra/database/Database.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import type { ResultStore } from "../repositories/ResultRepository.ts";
import { parsePage } from "../utils/paging.ts";
import type { ClientInfo, EntryCredentials, ExamRow, ExamSummary, StudentQuestion } from "../types.ts";
import { cleanString, isId } from "../utils/input.ts";
import type { AttemptService } from "./AttemptService.ts";
import type { EntryPasswordService } from "./EntryPasswordService.ts";
import type { GradingService } from "./GradingService.ts";

export interface StudentExam {
  id: number;
  title: string;
  duration_minutes: number | null;
  questions: StudentQuestion[];
  lock_on_leave: boolean; // roi trang -> khoa bai (true) / chi canh bao (false)
  entry_token?: string;   // de co mat khau: ve vao de (gui lai khi tai lai trang / nop bai)
  attempt_ticket?: string; // ve luot dang lam (gui lai khi tai lai trang / nop bai)
  draft_submitted?: boolean; // ban nhap tren may (theo khoa chong nop trung) da duoc nop -> bo ban nhap, lam luot moi
}

// 1 de trong danh sach cho thi sinh: kem lan nop gan nhat cua thi sinh (neu co)
export interface ExamListItem extends ExamSummary {
  my_result?: { id: number; score: number; pending: number; submitted_at: string | null };
}

export interface ListExamsQuery {
  q?: unknown;
  page?: unknown;
  size?: unknown;
  student?: unknown;
}

export interface ExamServiceDeps {
  exams: ExamStore;
  attempts: AttemptService;
  grading: GradingService;
  entryPasswords?: EntryPasswordService;
  results?: ResultStore;
}

export class ExamService {
  private readonly exams: ExamStore;
  private readonly attempts: AttemptService;
  private readonly grading: GradingService;
  readonly entryPasswords?: EntryPasswordService;
  private readonly results?: ResultStore;

  constructor({ exams, attempts, grading, entryPasswords, results }: ExamServiceDeps) {
    this.entryPasswords = entryPasswords;
    this.results = results;
    this.exams = exams;
    this.attempts = attempts;
    this.grading = grading;
  }

  // 1 trang danh sach de (mac dinh 3 de / trang, moi nhat truoc), tim theo ten; co student -> kem lan nop gan nhat
  async listExams({ q, page, size, student }: ListExamsQuery = {}): Promise<Page<ExamListItem>> {
    const req = parsePage(page, size);
    const { items, total } = await this.exams.page({ q: cleanString(q, 100), offset: req.offset, limit: req.size });
    const name = cleanString(student);
    const mine = name && this.results ? await this.results.listByStudentForExams(name, items.map(e => e.id)) : [];
    const latest = new Map<number, (typeof mine)[number]>();
    for (const r of mine) if (r.exam_id !== null && !latest.has(r.exam_id)) latest.set(r.exam_id, r); // da sap moi nhat truoc
    return {
      items: items.map(e => {
        const r = latest.get(e.id);
        return r ? { ...e, my_result: { id: r.id, score: Number(r.score), pending: this.grading.summarize(r.answers).pending, submitted_at: r.submitted_at } } : e;
      }),
      total,
      page: req.page,
      size: req.size
    };
  }

  titles(ids: number[]): Promise<Map<number, string>> {
    return this.exams.titles(ids);
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
    const status = studentName ? await this.attempts.status(exam, studentName) : null;
    // Het luot -> can giam thi; tru khi dang lam do 1 luot da duoc vao (ve luot con hop le: tai lai trang)
    if (status && !status.canStart && !this.attempts.isValidTicket(exam.id, studentName, status.used, entry?.attemptTicket)) {
      throw new ConflictError("Bạn đã nộp bài thi này rồi. Muốn làm lại cần giám thị nhập mật khẩu đề.", { needsProctor: true });
    }
    const token = this.entryPasswords ? await this.entryPasswords.admit(exam, studentName, entry) : null;
    const ticket = status ? this.attempts.ticketFor(exam.id, studentName, status.used) : null;
    const key = cleanString(entry?.submissionKey, 64);
    const draftSubmitted = !!(key && studentName && this.results && await this.results.findBySubmissionKey(exam.id, studentName, key));
    return {
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.duration_minutes,
      questions: (exam.questions ?? []).map(q => this.grading.sanitizeQuestion(q)),
      lock_on_leave: !!exam.lock_on_leave,
      ...(token ? { entry_token: token } : {}),
      ...(ticket ? { attempt_ticket: ticket } : {}),
      ...(draftSubmitted ? { draft_submitted: true } : {})
    };
  }
}
