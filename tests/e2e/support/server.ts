// Khoi dong cho test giao dien: Supabase gia lap + server that cua app, tro vao nhau.
// Playwright tu chay file nay (xem playwright.config.ts). Khong dung du lieu / khoa that.
import { createMockSupabase, SERVICE_KEY } from "./mockSupabase.ts";
import { ADMIN_PASSWORD, APP_PORT, MOCK_PORT, MOCK_URL, PROCTOR_PASSWORD } from "./env.ts";

// Dat truoc khi nap server.ts: bo nap .env chi dien bien con thieu -> .env that khong lan vao test
Object.assign(process.env, {
  PORT: String(APP_PORT),
  SUPABASE_URL: MOCK_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ADMIN_PASSWORD,
  PROCTOR_PASSWORD,
  SESSION_SECRET: "e2e-session-secret-0123456789abcdef"
});

createMockSupabase().listen(MOCK_PORT, () => console.log(`[e2e] Supabase giả lập: ${MOCK_URL}`));
await import("../../../server.ts");
