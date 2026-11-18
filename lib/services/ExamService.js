// De thi phia thi sinh: danh sach, lay de da loc dap an
const { ValidationError, NotFoundError, ConflictError } = require("../errors");
const { isId } = require("../utils/input");

class ExamService {
  constructor({ exams, results, grading }) {
    this.exams = exams;
    this.results = results;
    this.grading = grading;
  }

  listExams() {
    return this.exams.listSummaries();
  }

  // De day du (kem dap an) - chi dung noi bo server
  async getExamOrThrow(id) {
    if (!isId(id)) throw new ValidationError("Mã đề không hợp lệ.");
    const exam = await this.exams.findById(id);
    if (!exam) throw new NotFoundError("Không tìm thấy đề thi.");
    return exam;
  }

  // De gui cho thi sinh: bo dap an. Da nop roi -> khong cho lay lai.
  async getExamForStudent(id, studentName) {
    const exam = await this.getExamOrThrow(id);
    if (studentName && await this.results.findByExamAndStudent(exam.id, studentName)) {
      throw new ConflictError("Bạn đã nộp bài thi này rồi.");
    }
    return {
      id: exam.id,
      title: exam.title,
      duration_minutes: exam.duration_minutes,
      questions: (exam.questions || []).map(q => this.grading.sanitizeQuestion(q))
    };
  }
}

module.exports = { ExamService };
