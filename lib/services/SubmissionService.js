// Nop bai + lich su. Server tu cham; diem client gui len (neu co) bi bo qua.
const { ValidationError, ConflictError } = require("../errors");
const { cleanString, cleanLogs } = require("../utils/input");

const DEFAULT_DURATION = 45;

class SubmissionService {
  constructor({ examService, results, grading, now = () => new Date() }) {
    this.examService = examService;
    this.results = results;
    this.grading = grading;
    this.now = now;
  }

  // Tom tat 1 ket qua da luu (khong tra chi tiet tung cau)
  summaryOf(row) {
    return {
      id: row.id,
      score: Number(row.score),
      pending: this.grading.summarize(row.answers).pending,
      duration_minutes: row.duration_minutes,
      submitted_at: row.submitted_at
    };
  }

  async history(studentName) {
    const student = cleanString(studentName);
    if (!student) throw new ValidationError("Thiếu tên thí sinh.");
    const rows = await this.results.listByStudent(student);
    return rows.map(r => ({ exam_id: r.exam_id, ...this.summaryOf(r) }));
  }

  // payload: { exam_id, student_name, answers: {[index]: gia tri}, duration_minutes, action_logs }
  async submit(payload) {
    const student = cleanString(payload.student_name);
    if (!student) throw new ValidationError("Thiếu tên thí sinh.");
    const exam = await this.examService.getExamOrThrow(payload.exam_id);
    const questions = exam.questions || [];

    const existing = await this.results.findByExamAndStudent(exam.id, student);
    if (existing) {
      // Lan nop truoc da luu nhung mat phan hoi (mat mang) -> tra lai ket qua cu
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
    return { id: saved?.id, score, earned, total, autoMax, pending, duration_minutes: duration };
  }

  // Thoi luong do client bao: gioi han trong [1, thoi gian de + 1] phut
  clampDuration(reported, examMinutes) {
    const limit = examMinutes || DEFAULT_DURATION;
    return Math.min(limit + 1, Math.max(1, parseInt(reported, 10) || 1));
  }
}

module.exports = { SubmissionService };
