// Goi Supabase REST (PostgREST) bang khoa service_role. Giau chi tiet REST khoi cac repository.
const { UpstreamError } = require("../errors");

class SupabaseClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  // pathAndQuery: "exams?id=eq.1&select=*"
  async request(pathAndQuery, { method = "GET", body, prefer } = {}) {
    const key = this.config.supabaseServiceKey;
    const res = await this.fetch(`${this.config.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new UpstreamError(`Lỗi Supabase (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
  }

  // params: { id: "eq.1", select: "*", order: "id.desc", limit: 1 }
  async select(table, params = {}) {
    return (await this.request(`${table}?${SupabaseClient.query(params)}`)) || [];
  }

  async insert(table, row, { returning = false } = {}) {
    const rows = await this.request(table, { method: "POST", body: row, prefer: returning ? "return=representation" : undefined });
    return returning ? (rows && rows[0]) || null : null;
  }

  static query(params) {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
  }
}

module.exports = { SupabaseClient };
