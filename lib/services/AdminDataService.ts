// Trang admin truy van truc tiep cac bang cua he thong (sau khi da xac thuc token).
// Chi cho phep cac bang cua he thong; chan ".." va khoang trang de khong vuot ra ngoai /rest/v1/<bang>.
import type { RestGateway, RestMethod } from "../infra/database/Database.ts";
import { ValidationError } from "../errors.ts";
import { generateProctorCode, isProctorCode } from "../security/proctorCode.ts";
import type { UntrustedBody } from "../types.ts";

const ADMIN_TABLES = /^(exams|exam_results|exam_events|app_settings|app_versions)(\?|$)/;
const METHODS: readonly RestMethod[] = ["GET", "POST", "PATCH", "DELETE"];

export interface AdminDataServiceDeps {
  db: RestGateway;
  generateCode?: () => string;
}

export class AdminDataService {
  private readonly db: RestGateway;
  private readonly generateCode: () => string;

  constructor({ db, generateCode = generateProctorCode }: AdminDataServiceDeps) {
    this.db = db;
    this.generateCode = generateCode;
  }

  // request: { method, path: "exams?id=eq.1", body, prefer }
  // count: true (chi GET) -> { rows, total } de trang admin phan trang
  query({ method, path, body, prefer, count }: UntrustedBody): Promise<unknown> {
    const p = String(path ?? "");
    if (!ADMIN_TABLES.test(p) || /\.\.|\s/.test(p)) throw new ValidationError("Đường dẫn không hợp lệ.");
    const verb = METHODS.includes(method as RestMethod) ? (method as RestMethod) : "GET";
    if (verb === "GET" && count === true) return this.db.restWithCount(p);
    return this.db.rest(p, {
      method: verb,
      body: verb === "POST" && /^exams(\?|$)/.test(p) ? this.withProctorCode(body) : body ?? undefined,
      prefer: typeof prefer === "string" && prefer ? prefer : undefined
    });
  }

  // De moi xuat ban -> server tu gan ma giam thi 6 so ngau nhien (trinh duyet khong tu dat ma)
  private withProctorCode(body: unknown): unknown {
    const add = (row: unknown): unknown =>
      row && typeof row === "object" && !isProctorCode((row as Record<string, unknown>).proctor_code)
        ? { ...row, proctor_code: this.generateCode() }
        : row;
    return Array.isArray(body) ? body.map(add) : add(body);
  }
}
