// Truy van bang exams
class ExamRepository {
  constructor(db) {
    this.db = db;
  }

  // Danh sach de, khong kem cau hoi (cau hoi chua dap an)
  listSummaries() {
    return this.db.select("exams", { select: "id,title,duration_minutes,assigned_to,created_at", order: "id.desc" });
  }

  async findById(id) {
    const rows = await this.db.select("exams", { id: `eq.${id}`, select: "*" });
    return rows[0] || null;
  }
}

module.exports = { ExamRepository };
