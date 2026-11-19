// Cau hinh chung cho test giao dien (dung boi playwright.config.ts, server va cac spec)
export const APP_PORT = 3100;
export const MOCK_PORT = 3101;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const MOCK_URL = `http://localhost:${MOCK_PORT}`;

export const ADMIN_PASSWORD = "e2e-admin-pass";
export const PROCTOR_PASSWORD = "e2e-proctor-pass";
