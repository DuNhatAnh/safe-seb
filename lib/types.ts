// Kieu du lieu dung chung cua backend

// ------------------------------------------------------------ Cau hoi (luu trong exams.questions)
export type QuestionTypeId = "single" | "true_false" | "short_number" | "essay" | "essay_manual" | "short";

export interface Question {
  type?: QuestionTypeId;
  question: string;
  image?: string;
  part?: number;
  points?: number;
  options?: { text: string; is_correct?: boolean }[];
  statements?: { text: string; is_true?: boolean }[];
  answer?: string;
  answers?: string[];
  solution?: string;
}

// Cau hoi gui cho thi sinh: da bo dap an
export interface StudentQuestion {
  type?: QuestionTypeId;
  question: string;
  image?: string;
  part?: number;
  points?: number;
  options?: { text: string }[];
  statements?: { text: string }[];
  numeric?: boolean; // tu luan: dap an la so (hien ban phim so), khong lo gia tri
}

// Dap an thi sinh: so (trac nghiem), chuoi (go tay), mang dung/sai
export type AnswerValue = number | string | (boolean | null)[];
export type AnswerMap = Record<number, AnswerValue>;

// ------------------------------------------------------------ Bang Supabase
export interface ExamRow {
  id: number;
  title: string;
  duration_minutes: number | null;
  assigned_to?: string;
  questions: Question[] | null;
  // Ma giam thi 6 so cua de: thoat khan cap, thoat ung dung, cho lam lai. KHONG BAO GIO gui cho thi sinh.
  proctor_code?: string | null;
  // Safe Exam Browser: bat buoc lam bai tren SEB; mat khau thoat SEB (chi admin xem)
  require_seb?: boolean;
  seb_quit_password?: string | null;
  // Mat khau vao de (mac dinh tat): hoc sinh nhap moi bat dau lam duoc. Khac ma giam thi.
  require_password?: boolean;
  entry_password?: string | null;
  created_at?: string;
}

export type ExamSummary = Omit<ExamRow, "questions" | "proctor_code" | "seb_quit_password" | "entry_password">;

// Thong tin vao de co mat khau: mat khau vua nhap, hoac ve vao de server cap lan truoc
export interface EntryCredentials {
  password?: string;
  token?: string;
  ip: string;
}

// Thong tin may thi sinh (controller lay tu HTTP, service khong biet HTTP)
export interface ClientInfo {
  isSeb: boolean;   // dang chay trong Safe Exam Browser
  origin: string;   // vd: https://thi.truong.edu.vn (de dung link / file .seb)
}

// 1 dong ket qua cham cua 1 cau (dinh dang moi + truong cua ket qua cu)
export interface GradedEntry {
  question_index: number;
  part: number;
  type: string;
  answer: AnswerValue | null;
  max: number;
  points: number | null;
  pending: boolean;
  is_correct?: boolean; // ket qua dinh dang cu
}

export interface LogEntry {
  time: string;
  timestamp: string;
  type: string;
  detail: string;
  question_index: number | null;
  selected_option: unknown;
}

export interface ResultRow {
  id: number;
  exam_id: number | null;
  student_name: string;
  score: number | string;
  total_questions: number;
  duration_minutes: number | null;
  answers: GradedEntry[] | null;
  action_logs?: LogEntry[];
  submitted_at: string | null;
}

export type NewResult = Omit<ResultRow, "id">;
export type ResultSummaryRow = Pick<ResultRow, "id" | "exam_id" | "score" | "answers" | "duration_minutes" | "submitted_at">;

// CHO_LAM_LAI: giam thi nhap dung ma de thi sinh lam them 1 luot
// MO_KHOA: bai thi bi khoa vi thi sinh roi trang nhieu lan, giam thi nhap ma de lam tiep
export type EventType = "THOAT_KHAN_CAP" | "THOAT_UNG_DUNG" | "SAI_MAT_KHAU" | "CHO_LAM_LAI" | "MO_KHOA";

export interface NewEvent {
  exam_id: number | null;
  exam_title: string | null;
  student_name: string;
  type: EventType;
  detail: string;
  action_logs: LogEntry[];
}

// ------------------------------------------------------------ Ket qua cham
export interface ScoreSummary {
  earned: number;
  total: number;
  autoMax: number;
  pending: number;
}

export interface GradeResult extends ScoreSummary {
  entries: GradedEntry[];
  score: number;
}

// Du lieu client gui len (chua tin tuong) -> moi truong deu la unknown
export type UntrustedBody = Record<string, unknown>;
