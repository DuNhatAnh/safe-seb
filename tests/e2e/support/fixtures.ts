// Du lieu mau cho test giao dien
import type { StudentAnswer } from "./helpers.ts";

// De du 5 dang cau (seed thang vao DB) + dap an dung tuong ung theo thu tu cau
// Ma giam thi 6 so cua de mau (admin xem o trang quan tri)
export const FULL_EXAM_CODE = "246810";

export const FULL_EXAM = {
  title: "Đề kiểm thử đủ dạng",
  duration_minutes: 30,
  proctor_code: FULL_EXAM_CODE,
  questions: [
    { part: 0, points: 1, type: "single", question: "$1 + 1 = ?$", options: [{ text: "1", is_correct: false }, { text: "2", is_correct: true }, { text: "3", is_correct: false }] },
    { part: 0, points: 1, type: "single", question: "Thủ đô của Pháp?", options: [{ text: "Paris", is_correct: true }, { text: "Rome", is_correct: false }] },
    {
      part: 1, points: 1, type: "true_false", question: "Xét các mệnh đề:", statements: [
        { text: "2 là số chẵn", is_true: true }, { text: "3 là số chẵn", is_true: false },
        { text: "5 là số nguyên tố", is_true: true }, { text: "9 là số nguyên tố", is_true: false }
      ]
    },
    { part: 2, points: 1, type: "short_number", question: "Tính $\\frac{1}{2}$ dưới dạng số thập phân.", answer: "0,5" },
    { part: 3, points: 1, type: "essay", question: "Thủ đô của Việt Nam?", answers: ["Hà Nội", "Ha Noi"] },
    { part: 4, points: 1, type: "essay_manual", question: "Chứng minh $\\sqrt{2}$ là số vô tỉ.", solution: "Phản chứng." }
  ]
};

export const FULL_EXAM_RIGHT: StudentAnswer[] = [
  { kind: "option", index: 1 },
  { kind: "option", index: 0 },
  { kind: "tf", values: [true, false, true, false] },
  { kind: "text", value: "1/2" },        // cham theo gia tri: 1/2 = 0,5
  { kind: "text", value: "hà  nội" },    // bo hoa/thuong, khoang trang thua
  { kind: "skip" }                       // tu luan giao vien cham: lam tren giay
];

// JSON admin dan vao: khop mau co san "Trac nghiem + Tu luan ngan" (single + essay)
export const IMPORT_JSON = {
  title: "Kiểm tra 15 phút - Nhập từ JSON",
  duration_minutes: 15,
  parts: [
    {
      type: "single",
      questions: [
        { question: "Đạo hàm của $x^2$ là?", options: [{ text: "$2x$", is_correct: true }, { text: "$x$", is_correct: false }] },
        { question: "$\\sqrt{9} = ?$", options: [{ text: "3", is_correct: true }, { text: "9", is_correct: false }] }
      ]
    },
    {
      type: "essay",
      questions: [{ question: "Số nguyên tố chẵn duy nhất?", answers: ["2"] }]
    }
  ]
};

// JSON co cau truc chua co mau nao (dung sai + tra loi ngan) -> admin phai xac nhan mau moi
export const IMPORT_JSON_NEW_STRUCTURE = {
  title: "Đề cấu trúc mới",
  duration_minutes: 10,
  parts: [
    {
      type: "true_false",
      questions: [{
        question: "Hàm số $y = x^2$:",
        statements: [
          { text: "Đồng biến trên $(0; +\\infty)$", is_true: true }, { text: "Có cực đại", is_true: false },
          { text: "Đồ thị là parabol", is_true: true }, { text: "Nghịch biến trên $\\mathbb{R}$", is_true: false }
        ]
      }]
    },
    {
      type: "short_number",
      questions: [{ question: "$2^{-1} = ?$", answer: "0,5" }]
    }
  ]
};
