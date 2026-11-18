// Doc bien moi truong. Doc luc goi (khong doc luc khoi dong) de thieu bien chi lam hong API can no.
//   SUPABASE_URL               https://xxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  khoa service_role / sb_secret_... KHONG dua vao trinh duyet.
//   ADMIN_PASSWORD             mat khau quan tri
//   PROCTOR_PASSWORD           mat khau giam thi (thoat khan cap / thoat ung dung)
//   SESSION_SECRET             chuoi ngau nhien dai, de ky token admin
const { ConfigError } = require("./errors");

class Config {
  constructor(env = process.env) {
    this.env = env;
  }

  require(name) {
    const value = this.env[name];
    if (!value) throw new ConfigError(`Máy chủ chưa cấu hình biến môi trường ${name}.`);
    return value;
  }

  get supabaseUrl() { return this.require("SUPABASE_URL").replace(/\/$/, ""); }
  get supabaseServiceKey() { return this.require("SUPABASE_SERVICE_ROLE_KEY"); }
  get adminPassword() { return this.require("ADMIN_PASSWORD"); }
  get proctorPassword() { return this.require("PROCTOR_PASSWORD"); }
  get sessionSecret() { return this.require("SESSION_SECRET"); }
}

module.exports = { Config };
