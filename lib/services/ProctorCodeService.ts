// Admin xem mat khau de (nut chia khoa): moi o nhap mat khau nhan 1 trong 2
//   - common: mat khau chung cua moi de (PROCTOR_PASSWORD trong .env, muon doi thi sua bien moi truong)
//   - code:   ma rieng 6 so cua de (server sinh ngau nhien; regenerate=true -> doi ma moi, ma cu het hieu luc)
import type { Config } from "../config.ts";
import { NotFoundError, ValidationError } from "../errors.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import { generateProctorCode, isProctorCode } from "../security/proctorCode.ts";
import { isId } from "../utils/input.ts";

export interface ProctorCodeServiceDeps {
  config: Config;
  exams: ExamStore;
  generate?: () => string;
}

export class ProctorCodeService {
  private readonly config: Config;
  private readonly exams: ExamStore;
  private readonly generate: () => string;

  constructor({ config, exams, generate = generateProctorCode }: ProctorCodeServiceDeps) {
    this.config = config;
    this.exams = exams;
    this.generate = generate;
  }

  // De cu chua co ma rieng -> tao luon
  async getCode(examId: unknown, regenerate = false): Promise<{ exam_id: number; code: string; common: string }> {
    if (!isId(examId)) throw new ValidationError("Mã đề không hợp lệ.");
    const exam = await this.exams.findById(String(examId));
    if (!exam) throw new NotFoundError("Không tìm thấy đề thi.");
    const common = this.config.proctorPassword;
    if (!regenerate && isProctorCode(exam.proctor_code)) return { exam_id: exam.id, code: exam.proctor_code, common };

    let code = this.generate();
    if (code === exam.proctor_code) code = this.generate(); // doi ma thi phai khac ma cu
    await this.exams.setProctorCode(exam.id, code);
    return { exam_id: exam.id, code, common };
  }
}
