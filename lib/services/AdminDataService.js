// Trang admin truy van truc tiep cac bang cua he thong (sau khi da xac thuc token).
// Chi cho phep 4 bang; chan ".." va khoang trang de khong vuot ra ngoai /rest/v1/<bang>.
const { ValidationError } = require("../errors");

const ADMIN_TABLES = /^(exams|exam_results|exam_events|app_settings)(\?|$)/;
const METHODS = ["GET", "POST", "PATCH", "DELETE"];

class AdminDataService {
  constructor({ db }) {
    this.db = db;
  }

  // request: { method, path: "exams?id=eq.1", body, prefer }
  query({ method, path, body, prefer }) {
    const p = String(path || "");
    if (!ADMIN_TABLES.test(p) || /\.\.|\s/.test(p)) throw new ValidationError("Đường dẫn không hợp lệ.");
    return this.db.request(p, {
      method: METHODS.includes(method) ? method : "GET",
      body: body ?? undefined,
      prefer: prefer || undefined
    });
  }
}

module.exports = { AdminDataService };
