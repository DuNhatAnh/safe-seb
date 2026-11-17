// Cau hinh Supabase REST truc tiep
const SUPABASE_URL = "https://twavyhrlphhqsqiqvrzq.supabase.co";
const SUPABASE_KEY = "sb_publishable_Rsbi9aTsXeusrjzg0q2Eig_FYGZW_hH";
const PROCTOR_PASSWORD_DEFAULT = "123456";

// Ham goi API Supabase dung chung (DRY)
async function supabaseRequest(endpoint, method = "GET", body = null) {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": method === "POST" ? "return=representation" : ""
  };

  const config = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, config);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Loi ket noi Supabase (${response.status}): ${errorText}`);
  }
  return await response.json();
}

// Cac thao tac voi bang exams (Quan ly de thi)
const ExamService = {
  // Lay tat ca de thi cho thi sinh (Tat ca user deu nhan duoc de thi ma khong can phan quyen)
  async getAvailableExams() {
    return await supabaseRequest("exams?select=id,title,duration_minutes,assigned_to,created_at&order=id.desc");
  },

  // Alias tuong thich: nhan tat ca de thi cho bat ky username nao
  async getAssignedExams(username) {
    return await this.getAvailableExams();
  },

  // Lay tat ca de thi cho Admin
  async getAllExams() {
    return await supabaseRequest("exams?select=id,title,duration_minutes,assigned_to,created_at&order=id.desc");
  },

  // Tai chi tiet cau hoi cua 1 de thi (Chi goi khi an vao lam bai)
  async getExamDetail(examId) {
    const data = await supabaseRequest(`exams?id=eq.${examId}&select=*`);
    return data && data.length > 0 ? data[0] : null;
  },

  // Tao de thi moi tu Admin (Mac dinh assigned_to = 'all' cho tat ca thi sinh)
  async createExam(title, durationMinutes, questions, assignedTo = "all") {
    const payload = {
      title,
      duration_minutes: parseInt(durationMinutes, 10),
      assigned_to: assignedTo || "all",
      questions
    };
    return await supabaseRequest("exams", "POST", payload);
  }
};

// Cac thao tac voi bang exam_results (Ket qua va Nhat ky thao tac)
const ResultService = {
  // Luu ket qua thi va nhat ky len Supabase (Luu truoc - Khoa sau)
  async submitResult(examId, studentName, score, totalQuestions, durationMinutes, answers, actionLogs) {
    const payload = {
      exam_id: examId,
      student_name: studentName,
      score: parseFloat(score),
      total_questions: parseInt(totalQuestions, 10),
      duration_minutes: parseInt(durationMinutes, 10),
      answers,
      action_logs: actionLogs,
      submitted_at: new Date().toISOString()
    };
    return await supabaseRequest("exam_results", "POST", payload);
  },

  // Lay tat ca ket qua thi cho Admin xem nhat ky
  async getAllResults() {
    return await supabaseRequest("exam_results?select=*&order=id.desc");
  }
};

// Bo theo doi thao tac lam bai (Action Tracker)
class ActionTracker {
  constructor() {
    this.logs = [];
    this.startTime = new Date().toISOString();
    this.addLog("BAT_DAU", "Thi sinh bat dau lam bai");

    // Lang nghe su kien roi khoi man hinh / chuyen tab
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.addLog("ROI_MAN_HINH", "Thi sinh vua roi khoi tab hoac chuyen man hinh");
      } else {
        this.addLog("QUAY_LAI", "Thi sinh quay lai man hinh bai thi");
      }
    });

    window.addEventListener("blur", () => {
      this.addLog("MAT_TIEU_DIEM", "Cua so bi mat tieu diem (mo popup hoac chia man hinh)");
    });
  }

  addLog(type, detail, questionIndex = null, selectedOption = null) {
    this.logs.push({
      time: new Date().toLocaleTimeString("vi-VN"),
      timestamp: new Date().toISOString(),
      type,
      detail,
      question_index: questionIndex,
      selected_option: selectedOption
    });
  }

  getLogs() {
    return this.logs;
  }
}

// Bo quan ly bo nho tam LocalStorage de phong mat mang / tat nguon
const StorageHelper = {
  saveDraft(examId, answers, timeLeft) {
    try {
      localStorage.setItem(`safe_exam_draft_${examId}`, JSON.stringify({ answers, timeLeft, savedAt: Date.now() }));
    } catch (e) {
      console.warn("Khong the luu nhap:", e);
    }
  },

  getDraft(examId) {
    try {
      const data = localStorage.getItem(`safe_exam_draft_${examId}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clearDraft(examId) {
    localStorage.removeItem(`safe_exam_draft_${examId}`);
  }
};
