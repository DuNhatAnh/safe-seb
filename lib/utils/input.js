// Lam sach du lieu client gui len

// Chuoi da trim, cat toi da `max` ky tu
const cleanString = (v, max = 200) => String(v ?? "").trim().slice(0, max);

const isId = v => /^\d+$/.test(String(v));

// Nhat ky thao tac: chi giu cac truong biet truoc, gioi han so dong va do dai
function cleanLogs(logs) {
  return (Array.isArray(logs) ? logs : []).slice(0, 5000).map(l => ({
    time: cleanString(l?.time, 20),
    timestamp: cleanString(l?.timestamp, 40),
    type: cleanString(l?.type, 40),
    detail: cleanString(l?.detail, 500),
    question_index: Number.isInteger(l?.question_index) ? l.question_index : null,
    selected_option: l?.selected_option ?? null
  }));
}

module.exports = { cleanString, cleanLogs, isId };
