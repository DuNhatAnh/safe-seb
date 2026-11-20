// Nop bai + lich su. Server tu cham; diem client gui len (neu co) bi bo qua.
import { ConflictError, ValidationError } from "../errors.ts";
import type { ResultStore } from "../repositories/ResultRepository.ts";
import type { AttemptService } from "./AttemptService.ts";
import type { ClientInfo, ResultSummaryRow, UntrustedBody } from "../types.ts";
import type { Page } from "../infra/database/Database.ts";
import { cleanLogs, cleanString } from "../utils/input.ts";
import { parsePage } from "../utils/paging.ts";
import type { ExamService } from "./ExamService.ts";
import type { GradingService } from "./GradingService.ts";

const DEFAULT_DURATION = 45;

export interface ResultSummary {
  id: number;
  score: number;
  pending: number;
  duration_minutes: number | null;
  submitted_at: string | null;
}

export interface SubmitResult {
  id: number | undefined;
  score: number;
  earned: number;
  total: number;
  autoMax: number;
  pending: number;
  duration_minutes: number;
  seb_quit_url?: string; // dang chay trong SEB: trang thoat SEB (nop xong thoat khong can ma)
}

export interface SubmissionServiceDeps {
  examService: ExamService;
  results: ResultStore;
  attempts: AttemptService;
  grading: GradingService;
  now?: () => Date;
  sebQuitUrl?: (examId: number, origin: string) => string;
}

export class SubmissionService {
  private readonly examService: ExamService;
  private readonly results: ResultStore;
  private readonly attempts: AttemptService;
  private readonly grading: GradingService;
  private readonly now: () => Date;
  private readonly sebQuitUrl?: (examId: number, origin: string) => string;

  constructor({ examService, results, attempts, grading, now = () => new Date(), sebQuitUrl }: SubmissionServiceDeps) {
    this.sebQuitUrl = sebQuitUrl;
    this.examService = examService;
    this.results = results;
    this.attempts = attempts;
    this.grading = grading;
    this.now = now;
  }

  // Tom tat 1 ket qua da luu (khong tra chi tiet tung cau)
  summaryOf(row: ResultSummaryRow): ResultSummary {
    return {
      id: row.id,
      score: Number(row.score),
      pending: this.grading.summarize(row.answers).pending,
      duration_minutes: row.duration_minutes,
      submitted_at: row.submitted_at
    };
  }

  // 1 trang lich su lam bai (mac dinh 3 bai / trang, moi nhat truoc)
  async history(studentName: unknown, page?: unknown, size?: unknown): Promise<Page<ResultSummary & { exam_id: number | null; exam_title: string | null }>> {
    const student = cleanString(studentName);
    if (!student) throw new ValidationError("Thiếu tên thí sinh.");
    const req = parsePage(page, size);
    const { items, total } = await this.results.pageByStudent(student, req.offset, req.size);
    const titles = await this.examService.titles(items.flatMap(r => (r.exam_id === null ? [] : [Number(r.exam_id)])));
    return {
      items: items.map(r => ({ exam_id: r.exam_id, exam_title: r.exam_id === null ? null : titles.get(Number(r.exam_id)) ?? null, ...this.summaryOf(r) })),
      total, page: req.page, size: req.size
    };
  }

  // payload: { exam_id, student_name, answers: {[index]: gia tri}, duration_minutes, action_logs }
  async submit(payload: UntrustedBody, client?: ClientInfo): Promise<SubmitResult> {
    const student = cleanString(payload.student_name);
    if (!student) throw new ValidationError("Thiếu tên thí sinh.");
    const exam = await this.examService.getExamOrThrow(payload.exam_id);
    this.examService.assertClientAllowed(exam, client);
    // De co mat khau: phai kem ve vao de server cap khi lay de
    this.examService.entryPasswords?.assertToken(exam, student, payload.entry_token);
    const questions = exam.questions ?? [];

    // Het luot: thuong la lan nop truoc da luu nhung mat phan hoi (mat mang) -> tra lai ket qua gan nhat
    const { canStart, latest: existing } = await this.attempts.status(exam.id, student);
    if (!canStart && existing) {
      const { earned, total, autoMax } = this.grading.summarize(existing.answers);
      throw new ConflictError("Bài thi này đã được nộp.", { result: { ...this.summaryOf(existing), earned, total, autoMax } });
    }

    const { entries, earned, total, autoMax, pending, score } = this.grading.grade(questions, payload.answers);
    const duration = this.clampDuration(payload.duration_minutes, exam.duration_minutes);
    const saved = await this.results.create({
      exam_id: exam.id,
      student_name: student,
      score,
      total_questions: questions.length,
      duration_minutes: duration,
      answers: entries,
      action_logs: cleanLogs(payload.action_logs),
      submitted_at: this.now().toISOString()
    });
    const quit = client?.isSeb && this.sebQuitUrl ? this.sebQuitUrl(exam.id, client.origin) : undefined;
    return { id: saved.id, score, earned, total, autoMax, pending, duration_minutes: duration, ...(quit ? { seb_quit_url: quit } : {}) };
  }

  // Thoi luong do client bao: gioi han trong [1, thoi gian de + 1] phut
  clampDuration(reported: unknown, examMinutes: number | null): number {
    const limit = examMinutes || DEFAULT_DURATION;
    return Math.min(limit + 1, Math.max(1, parseInt(String(reported), 10) || 1));
  }
}
