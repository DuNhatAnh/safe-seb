// Mat khau de: moi o nhap mat khau (vao de, cho lam lai, mo khoa bai, thoat khan cap) nhan 1 trong 2:
//   - mat khau chung cua moi de: PROCTOR_PASSWORD trong .env (mat khau mac dinh)
//   - ma rieng 6 so cua de do (exams.proctor_code; admin xem / doi o nut chia khoa)
// Ma rieng cua de khac KHONG dung duoc.
import type { ExamRow } from "../types.ts";
import { isProctorCode } from "./proctorCode.ts";
import { secureCompare } from "./secureCompare.ts";

export function matchesExamPassword(password: string, exam: Pick<ExamRow, "proctor_code"> | null, commonPassword: string): boolean {
  if (!password) return false;
  // So ca 2 (khong dung som) de thoi gian tra loi khong lo mat khau nao dung
  const common = secureCompare(password, commonPassword);
  const own = isProctorCode(exam?.proctor_code) && secureCompare(password, exam.proctor_code);
  return common || own;
}
