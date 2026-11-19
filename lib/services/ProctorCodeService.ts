// Admin xem / doi ma giam thi 6 so cua tung de
import { NotFoundError, ValidationError } from "../errors.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import { generateProctorCode, isProctorCode } from "../security/proctorCode.ts";
import { isId } from "../utils/input.ts";

export interface ProctorCodeServiceDeps {
  exams: ExamStore;
  generate?: () => string;
}

export class ProctorCodeService {
  private readonly exams: ExamStore;
  private readonly generate: () => string;

  constructor({ exams, generate = generateProctorCode }: ProctorCodeServiceDeps) {
    this.exams = exams;
    this.generate = generate;
  }

  // regenerate=true: doi ma moi (ma cu het hieu luc ngay). De cu chua co ma -> tao luon.
  async getCode(examId: unknown, regenerate = false): Promise<{ exam_id: number; code: string }> {
    if (!isId(examId)) throw new ValidationError("Mã đề không hợp lệ.");
    const exam = await this.exams.findById(String(examId));
    if (!exam) throw new NotFoundError("Không tìm thấy đề thi.");
    if (!regenerate && isProctorCode(exam.proctor_code)) return { exam_id: exam.id, code: exam.proctor_code };

    let code = this.generate();
    if (code === exam.proctor_code) code = this.generate(); // doi ma thi phai khac ma cu
    await this.exams.setProctorCode(exam.id, code);
    return { exam_id: exam.id, code };
  }
}
