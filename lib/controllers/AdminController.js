// API quan tri: dang nhap lay token, proxy du lieu (bat buoc token)
class AdminController {
  constructor({ authService, adminDataService }) {
    this.authService = authService;
    this.adminDataService = adminDataService;
  }

  register(router) {
    router
      .post("admin/login", ({ body, ip }) => this.authService.login(body.password, ip))
      .post("admin/rest", ({ req, body }) => {
        this.authService.assertAdmin(req.headers.authorization);
        return this.adminDataService.query(body);
      });
  }
}

module.exports = { AdminController };
