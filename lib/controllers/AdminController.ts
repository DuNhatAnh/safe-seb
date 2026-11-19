// API quan tri: dang nhap lay token, proxy du lieu (bat buoc token)
import type { Router } from "../http/Router.ts";
import type { AdminDataService } from "../services/AdminDataService.ts";
import type { AuthService } from "../services/AuthService.ts";
import type { EntryPasswordService } from "../services/EntryPasswordService.ts";
import type { ProctorCodeService } from "../services/ProctorCodeService.ts";
import type { SebConfigService } from "../services/SebConfigService.ts";

export interface AdminControllerDeps {
  authService: AuthService;
  adminDataService: AdminDataService;
  proctorCodeService: ProctorCodeService;
  sebConfigService: SebConfigService;
  entryPasswordService: EntryPasswordService;
}

export class AdminController {
  private readonly authService: AuthService;
  private readonly adminDataService: AdminDataService;
  private readonly proctorCodeService: ProctorCodeService;
  private readonly sebConfigService: SebConfigService;
  private readonly entryPasswordService: EntryPasswordService;

  constructor({ authService, adminDataService, proctorCodeService, sebConfigService, entryPasswordService }: AdminControllerDeps) {
    this.entryPasswordService = entryPasswordService;
    this.sebConfigService = sebConfigService;
    this.authService = authService;
    this.adminDataService = adminDataService;
    this.proctorCodeService = proctorCodeService;
  }

  register(router: Router): void {
    router
      .post("admin/login", ({ body, ip }) => this.authService.login(body.password, ip))
      .post("admin/rest", ({ req, body }) => {
        this.authService.assertAdmin(req.headers.authorization);
        return this.adminDataService.query(body);
      })
      // Xem ma giam thi 6 so cua de; regenerate=true -> doi ma moi
      .post("admin/proctor-code", ({ req, body }) => {
        this.authService.assertAdmin(req.headers.authorization);
        return this.proctorCodeService.getCode(body.exam_id, body.regenerate === true);
      })
      // Mat khau vao de: { exam_id, enabled?: boolean, regenerate?: true }
      .post("admin/entry-password", ({ req, body }) => {
        this.authService.assertAdmin(req.headers.authorization);
        return this.entryPasswordService.settings(body.exam_id, {
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          regenerate: body.regenerate === true
        });
      })
      // Cai dat SEB cua de: { exam_id, require_seb?: boolean, regenerate_password?: true }
      .post("admin/seb", ({ req, body, client }) => {
        this.authService.assertAdmin(req.headers.authorization);
        return this.sebConfigService.settings(body.exam_id, client.origin, {
          require: typeof body.require_seb === "boolean" ? body.require_seb : undefined,
          regenerate: body.regenerate_password === true
        });
      });
  }
}
