// API cong khai cho thi sinh: chi doi HTTP <-> service, khong chua nghiep vu
const { cleanString } = require("../utils/input");

class StudentController {
  constructor({ examService, submissionService, proctorService }) {
    this.examService = examService;
    this.submissionService = submissionService;
    this.proctorService = proctorService;
  }

  register(router) {
    router
      .get("exams", () => this.examService.listExams())
      .get("exam", ({ query }) => this.examService.getExamForStudent(query.get("id"), cleanString(query.get("student"))))
      .get("history", ({ query }) => this.submissionService.history(query.get("student")))
      .post("submit", ({ body }) => this.submissionService.submit(body))
      .post("proctor-exit", ({ body, ip }) => this.proctorService.authorizeExit(body, ip));
  }
}

module.exports = { StudentController };
