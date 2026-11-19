// Diem vao Vercel: moi /api/* duoc rewrite ve day (xem vercel.json).
// Vercel chay `npm run build` truoc -> dist/lib/api.js la ban JS cua lib/api.ts.
import { handle } from "../dist/lib/api.js";

export default function handler(req, res) {
  return handle(req, res);
}
