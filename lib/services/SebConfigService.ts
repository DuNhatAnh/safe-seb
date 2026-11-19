// Safe Exam Browser (SEB): sinh file cau hinh .seb cho tung de + cai dat SEB cua de (admin).
//
// File .seb la XML plist (dinh dang cau hinh cua SEB). Chi dat cac khoa can thiet; con lai dung mac dinh
// cua SEB (che do kiosk: chan Alt+Tab, phim Windows, thanh tac vu, ung dung khac).
//   startURL           trang dang nhap cua he thong
//   quitURL            trang thoat rieng cua de: app mo trang nay SAU KHI server xac nhan ma giam thi -> SEB tu dong
//   hashedQuitPassword SHA-256 cua mat khau thoat SEB (du phong khi khong vao duoc app)
// File .seb ai cung tai duoc (link sebs://), nen mat khau thoat la chuoi ngau nhien dai, KHONG phai ma 6 so.
import crypto from "node:crypto";
import type { Config } from "../config.ts";
import { NotFoundError, ValidationError } from "../errors.ts";
import type { ExamStore } from "../repositories/ExamRepository.ts";
import type { ExamRow } from "../types.ts";
import { isId } from "../utils/input.ts";

export interface SebSettings {
  exam_id: number;
  require_seb: boolean;
  quit_password: string;
  config_url: string;   // tai file .seb (https)
  seb_link: string;     // sebs://... hoac seb://... : bam la mo SEB voi cau hinh cua de
}

export interface SebConfigServiceDeps {
  config: Config;
  exams: ExamStore;
  randomPassword?: () => string;
}

type PlistValue = string | number | boolean | PlistValue[] | { [key: string]: PlistValue };

export class SebConfigService {
  private readonly config: Config;
  private readonly exams: ExamStore;
  private readonly randomPassword: () => string;

  constructor({ config, exams, randomPassword = SebConfigService.generatePassword }: SebConfigServiceDeps) {
    this.config = config;
    this.exams = exams;
    this.randomPassword = randomPassword;
  }

  static generatePassword(): string {
    return crypto.randomBytes(12).toString("base64url"); // 16 ky tu, ~96 bit
  }

  // ---------------------------------------------------------- Admin
  // Xem cai dat SEB cua de; require: bat/tat bat buoc SEB; regenerate: doi mat khau thoat SEB
  async settings(examId: unknown, origin: string, { require, regenerate = false }: { require?: boolean; regenerate?: boolean } = {}): Promise<SebSettings> {
    const exam = await this.examOrThrow(examId);
    const patch: Partial<ExamRow> = {};
    if (typeof require === "boolean" && require !== !!exam.require_seb) patch.require_seb = require;
    if (regenerate || !exam.seb_quit_password) patch.seb_quit_password = this.randomPassword();
    if (Object.keys(patch).length) await this.exams.update(exam.id, patch);
    const merged = { ...exam, ...patch };
    return {
      exam_id: exam.id,
      require_seb: !!merged.require_seb,
      quit_password: merged.seb_quit_password!,
      config_url: this.configUrl(exam.id, origin),
      seb_link: this.sebLink(exam.id, origin)
    };
  }

  // ---------------------------------------------------------- File .seb (cong khai)
  async configFile(examId: unknown, origin: string): Promise<string> {
    let exam = await this.examOrThrow(examId);
    if (!exam.seb_quit_password) {
      await this.exams.update(exam.id, { seb_quit_password: this.randomPassword() });
      exam = await this.examOrThrow(exam.id);
    }
    return SebConfigService.plist({
      sebConfigPurpose: 0,                 // 0 = file de bat dau lam bai
      startURL: `${origin}/index.html`,
      quitURL: this.quitUrl(exam.id, origin),
      quitURLConfirm: false,
      allowQuit: true,
      hashedQuitPassword: crypto.createHash("sha256").update(exam.seb_quit_password!).digest("hex"),
      browserViewMode: 1,                  // toan man hinh
      allowBrowsingBackForward: false,
      browserWindowAllowReload: false,
      showReloadButton: false,
      allowSpellCheck: false,
      enablePrintScreen: false,
      allowSwitchToApplications: false,
      sendBrowserExamKey: true             // gui header xac thuc SEB (de kiem tra chat hon ve sau)
    });
  }

  // Trang thoat SEB rieng cua de: ma bi mat suy tu SESSION_SECRET (khong can luu), hoc sinh khong doan duoc
  quitPath(examId: number): string {
    const token = crypto.createHmac("sha256", this.config.sessionSecret).update(`seb-quit:${examId}`).digest("base64url").slice(0, 22);
    return `/seb-quit.html?exam=${examId}&k=${token}`;
  }

  quitUrl(examId: number, origin: string): string {
    return origin + this.quitPath(examId);
  }

  configUrl(examId: number, origin: string): string {
    return `${origin}/api/seb-config?exam_id=${examId}`;
  }

  // https -> sebs://, http (chay local) -> seb://  (SEB tu tai file cau hinh qua giao thuc tuong ung)
  sebLink(examId: number, origin: string): string {
    return this.configUrl(examId, origin).replace(/^http(s?):\/\//, (_m, s: string) => `seb${s}://`);
  }

  private async examOrThrow(examId: unknown): Promise<ExamRow> {
    if (!isId(examId)) throw new ValidationError("Mã đề không hợp lệ.");
    const exam = await this.exams.findById(String(examId));
    if (!exam) throw new NotFoundError("Không tìm thấy đề thi.");
    return exam;
  }

  // ---------------------------------------------------------- XML plist
  static plist(dict: Record<string, PlistValue>): string {
    const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const value = (v: PlistValue, indent: string): string => {
      if (typeof v === "boolean") return `${indent}<${v}/>`;
      if (typeof v === "number") return Number.isInteger(v) ? `${indent}<integer>${v}</integer>` : `${indent}<real>${v}</real>`;
      if (typeof v === "string") return `${indent}<string>${esc(v)}</string>`;
      if (Array.isArray(v)) return `${indent}<array>\n${v.map(x => value(x, indent + "\t")).join("\n")}\n${indent}</array>`;
      return `${indent}<dict>\n${Object.entries(v).map(([k, x]) => `${indent}\t<key>${esc(k)}</key>\n${value(x, indent + "\t")}`).join("\n")}\n${indent}</dict>`;
    };
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${value(dict, "")}
</plist>
`;
  }
}
