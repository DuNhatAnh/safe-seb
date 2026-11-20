// API cong khai cho thi sinh: chi doi HTTP <-> service, khong chua nghiep vu
import { RawResponse, type Router } from "../http/Router.ts";
import type { ExamService } from "../services/ExamService.ts";
import type { ProctorService } from "../services/ProctorService.ts";
import type { SebConfigService } from "../services/SebConfigService.ts";
import type { SubmissionService } from "../services/SubmissionService.ts";
import { cleanString } from "../utils/input.ts";
import { versionInfo } from "../version.ts";

export interface StudentControllerDeps {
  examService: ExamService;
  submissionService: SubmissionService;
  proctorService: ProctorService;
  sebConfigService: SebConfigService;
}

export class StudentController {
  private readonly examService: ExamService;
  private readonly submissionService: SubmissionService;
  private readonly proctorService: ProctorService;
  private readonly sebConfigService: SebConfigService;

  constructor({ examService, submissionService, proctorService, sebConfigService }: StudentControllerDeps) {
    this.sebConfigService = sebConfigService;
    this.examService = examService;
    this.submissionService = submissionService;
    this.proctorService = proctorService;
  }

  private static header(v: string | string[] | undefined): string | undefined {
    return (Array.isArray(v) ? v[0] : v) || undefined;
  }

  register(router: Router): void {
    router
      // Phien ban dang chay (hien o cuoi trang)
      .get("version", () => versionInfo())
      .get("exams", ({ query }) => this.examService.listExams({
        q: query.get("q"), page: query.get("page"), size: query.get("size"), student: query.get("student")
      }))
      // Mat khau vao de / ve vao de gui qua header (khong de trong URL de khong luu vao log)
      .get("exam", ({ req, query, client, ip }) => this.examService.getExamForStudent(query.get("id"), cleanString(query.get("student")), client, {
        password: StudentController.header(req.headers["x-exam-password"]),
        token: StudentController.header(req.headers["x-exam-entry"]),
        ip
      }))
      .get("history", ({ query }) => this.submissionService.history(query.get("student"), query.get("page"), query.get("size")))
      .post("submit", ({ body, client }) => this.submissionService.submit(body, client))
      .post("proctor-exit", ({ body, ip, client }) => this.proctorService.authorizeExit(body, ip, client))
      // File cau hinh SEB cua de (cong khai: SEB tai qua link sebs://)
      .get("seb-config", async ({ query, client }) => new RawResponse(
        await this.sebConfigService.configFile(query.get("exam_id"), client.origin),
        { "Content-Type": "application/seb", "Content-Disposition": `attachment; filename="safe-exam-de-${Number(query.get("exam_id"))}.seb"` }
      ))
      .post("retake", ({ body, ip }) => this.proctorService.grantRetake(body, ip));
  }
}
