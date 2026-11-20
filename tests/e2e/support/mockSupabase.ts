// Supabase REST (PostgREST) gia lap trong bo nho, du dung cho app:
//   GET   ?col=eq.x|is.null|in.(a,b)|gte.x|lt.x|ilike.*x*&select=a,b&order=col.asc|desc&limit=n&offset=n
//         Prefer: count=exact -> header Content-Range "a-b/tong"
//   POST  (Prefer: return=representation; app_settings upsert on_conflict=key)
//   PATCH / DELETE theo bo loc eq
// Cong dieu khien cho test:  POST /__test/reset  POST /__test/seed {table, rows}  GET /__test/state
import http from "node:http";

export const SERVICE_KEY = "e2e-service-key";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const TABLES = ["exams", "exam_results", "exam_events", "app_settings"] as const;

export function createMockSupabase(): http.Server {
  let tables: Tables = {};
  let nextId = 1;
  let clock = 0; // created_at tang dan (sap xep "moi nhat" on dinh)
  const reset = (): void => {
    tables = Object.fromEntries(TABLES.map(t => [t, []]));
    nextId = 1;
    clock = 0;
  };
  reset();

  const send = (res: http.ServerResponse, status: number, data: unknown): void => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(data === undefined ? "" : JSON.stringify(data));
  };

  const insert = (table: string, row: Row): Row => {
    const saved: Row = { id: nextId++, created_at: new Date(Date.now() + clock++).toISOString(), ...row };
    if (table === "app_settings") delete saved.id;
    tables[table].push(saved);
    return saved;
  };

  return http.createServer((req, res) => {
    let raw = "";
    req.on("data", c => { raw += c; });
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://mock");
      const body: unknown = raw ? JSON.parse(raw) : undefined;

      // ---- Dieu khien tu test
      if (url.pathname === "/__test/reset") { reset(); return send(res, 200, { ok: true }); }
      if (url.pathname === "/__test/state") return send(res, 200, tables);
      if (url.pathname === "/__test/seed") {
        const { table, rows } = body as { table: string; rows: Row[] };
        return send(res, 200, rows.map(r => insert(table, r)));
      }

      // ---- REST: chi chap nhan khoa service_role (giong Supabase sau khi dong RLS)
      if (req.headers.apikey !== SERVICE_KEY) return send(res, 401, { message: "Invalid API key" });
      const table = url.pathname.replace(/^\/rest\/v1\//, "");
      if (!tables[table]) return send(res, 404, { message: `relation "${table}" does not exist` });

      const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict"]);
      const filters = [...url.searchParams].filter(([k]) => !RESERVED.has(k));
      const cmp = (a: unknown, b: unknown): number =>
        typeof a === "number" && !Number.isNaN(Number(b)) ? a - Number(b) : String(a ?? "").localeCompare(String(b ?? ""));
      const test = (value: unknown, cond: string): boolean => {
        const [op, ...rest] = cond.split(".");
        const arg = rest.join(".");
        switch (op) {
          case "eq": return String(value) === arg;
          case "is": return arg === "null" ? value == null : String(value) === arg;
          case "in": return arg.replace(/^\(|\)$/g, "").split(",").map(x => x.replace(/^"|"$/g, "")).includes(String(value));
          case "gte": return value != null && cmp(value, arg) >= 0;
          case "lt": return value != null && cmp(value, arg) < 0;
          case "ilike": return String(value ?? "").toLowerCase().includes(arg.replace(/\*/g, "").toLowerCase());
          default: return true;
        }
      };
      const match = (r: Row): boolean => filters.every(([k, v]) => test(r[k], v));
      const wantRows = String(req.headers.prefer ?? "").includes("return=representation");

      switch (req.method) {
        case "GET": {
          let rows = tables[table].filter(match);
          const total = rows.length;
          const order = url.searchParams.get("order");
          if (order) {
            const [col, dir] = order.split(".");
            rows = [...rows].sort((a, b) => cmp(a[col], b[col]) * (dir === "desc" ? -1 : 1));
          }
          const offset = Number(url.searchParams.get("offset") ?? 0);
          const limit = url.searchParams.get("limit");
          rows = rows.slice(offset, limit ? offset + Number(limit) : undefined);
          const select = url.searchParams.get("select");
          if (select && select !== "*") {
            const cols = select.split(",");
            rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
          }
          if (String(req.headers.prefer ?? "").includes("count=exact")) {
            res.setHeader("Content-Range", rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`);
          }
          return send(res, 200, rows);
        }
        case "POST": {
          const list = (Array.isArray(body) ? body : [body]) as Row[];
          const saved = list.map(row => {
            if (table === "app_settings" && url.searchParams.get("on_conflict") === "key") {
              const existing = tables.app_settings.find(r => r.key === row.key);
              if (existing) return Object.assign(existing, row);
            }
            return insert(table, row);
          });
          return send(res, 201, wantRows ? saved : undefined);
        }
        case "PATCH": {
          const rows = tables[table].filter(match).map(r => Object.assign(r, body as Row));
          return send(res, 200, wantRows ? rows : undefined);
        }
        case "DELETE": {
          tables[table] = tables[table].filter(r => !match(r));
          return send(res, 204, undefined);
        }
        default:
          return send(res, 405, { message: "Method not allowed" });
      }
    });
  });
}
