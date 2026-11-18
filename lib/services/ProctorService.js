// Giam thi nhap mat khau de thi sinh thoat. Dung / sai deu ghi vao exam_events.
const { UnauthorizedError } = require("../errors");
const { secureCompare } = require("../security/secureCompare");
const { cleanString, cleanLogs, isId } = require("../utils/input");

const EXIT_TYPES = ["THOAT_KHAN_CAP", "THOAT_UNG_DUNG"];

class ProctorService {
  constructor({ config, events, limiter }) {
    this.config = config;
    this.events = events;
    this.limiter = limiter;
  }

  // payload: { password, type, student_name, exam_id, exam_title, detail, action_logs }; clientIp de chong do mat khau
  async authorizeExit(payload, clientIp) {
    const student = cleanString(payload.student_name);
    const type = EXIT_TYPES.includes(payload.type) ? payload.type : "THOAT_UNG_DUNG";
    const lockKey = `${clientIp}:${student}`;
    this.limiter.assertNotLocked(lockKey);

    const base = {
      exam_id: isId(payload.exam_id) ? Number(payload.exam_id) : null,
      exam_title: payload.exam_title ? cleanString(payload.exam_title) : null,
      student_name: student || "(không rõ)"
    };

    if (!secureCompare(cleanString(payload.password, 100), this.config.proctorPassword)) {
      const left = this.limiter.recordFailure(lockKey);
      const action = type === "THOAT_KHAN_CAP" ? "thoát khẩn cấp" : "thoát ứng dụng";
      // Ghi su co sai mat khau; loi ghi khong duoc lam lech thong bao cho giam thi
      await this.events.create({ ...base, type: "SAI_MAT_KHAU", detail: `Nhập sai mật khẩu giám thị khi ${action}.`, action_logs: [] }).catch(() => { });
      throw new UnauthorizedError(left ? `Mật khẩu không đúng! Còn ${left} lần thử.` : `Mật khẩu không đúng! Đã tạm khoá ${this.limiter.lockMinutes} phút.`);
    }

    this.limiter.reset(lockKey);
    await this.events.create({ ...base, type, detail: cleanString(payload.detail, 1000), action_logs: cleanLogs(payload.action_logs) });
    return { ok: true };
  }
}

module.exports = { ProctorService };
