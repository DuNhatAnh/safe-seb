// Truy van bang exam_results
const SUMMARY_COLUMNS = "id,exam_id,score,answers,duration_minutes,submitted_at";

class ResultRepository {
  constructor(db) {
    this.db = db;
  }

  // Bai nop dau tien cua thi sinh cho de nay (moi de chi nop 1 lan)
  async findByExamAndStudent(examId, studentName) {
    const rows = await this.db.select("exam_results", {
      exam_id: `eq.${examId}`,
      student_name: `eq.${studentName}`,
      select: SUMMARY_COLUMNS,
      order: "id.asc",
      limit: 1
    });
    return rows[0] || null;
  }

  listByStudent(studentName) {
    return this.db.select("exam_results", { student_name: `eq.${studentName}`, select: SUMMARY_COLUMNS, order: "id.desc" });
  }

  create(result) {
    return this.db.insert("exam_results", result, { returning: true });
  }
}

module.exports = { ResultRepository };
