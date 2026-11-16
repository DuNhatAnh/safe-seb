const pdfParse = require("pdf-parse");

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Chi chap nhan phuong thuc POST" });
  }

  try {
    // Thu thap du lieu buffer tu request
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Khong nhan duoc du lieu file PDF" });
    }

    // Doc van ban tu PDF bang pdf-parse
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text || "";

    if (!rawText.trim()) {
      return res.status(400).json({ error: "Khong the trich xuat van ban tu file PDF nay" });
    }

    // Phan tich va boc tach cau hoi tu van ban
    const questions = extractQuestionsFromText(rawText);

    return res.status(200).json({
      success: true,
      total_questions: questions.length,
      questions
    });
  } catch (err) {
    return res.status(500).json({ error: "Loi xu ly file PDF: " + err.message });
  }
};

// Ham tach cau hoi va phat hien phuong an khoanh tron
function extractQuestionsFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const questions = [];
  let currentQuestion = null;

  // Cac ky tu khoanh tron Unicode chuan (Circled Latin Letters)
  const circledA = /[\u24B6\u24D0]/; // Ⓐ hoac ⓐ
  const circledB = /[\u24B7\u24D1]/; // Ⓑ hoac ⓑ
  const circledC = /[\u24B8\u24D2]/; // Ⓒ hoac ⓒ
  const circledD = /[\u24B9\u24D3]/; // Ⓓ hoac ⓓ

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Nhan dien bat dau mot cau hoi: "Cau 1:", "Cau 1.", "1.", "Bai 1:"
    const qMatch = line.match(/^(?:c[âa]u\s*\d+|b[àa]i\s*\d+|\d+)[\s.:-]+(.*)/i);
    if (qMatch) {
      if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
      }
      currentQuestion = {
        question: qMatch[1].trim() || line,
        options: []
      };
      continue;
    }

    // Nhan dien cac phuong an A, B, C, D
    const optMatch = line.match(/^([A-D\u24B6-\u24B9\u24D0-\u24D3]|(?:\([A-D]\))|(?:\[[A-D]\]))[\s.:-]+(.*)/i);
    if (optMatch && currentQuestion) {
      const prefix = optMatch[1];
      const optText = optMatch[2].trim();

      // Kiem tra xem phuong an co mang ky tu khoanh tron hoac danh dau khong
      const isCircled = circledA.test(prefix) || 
                        circledB.test(prefix) || 
                        circledC.test(prefix) || 
                        circledD.test(prefix) ||
                        prefix.startsWith("(") ||
                        prefix.startsWith("[");

      currentQuestion.options.push({
        text: optText,
        is_correct: isCircled
      });
      continue;
    }

    // Neu khong phai dong cau hoi hay phuong an moi, ghep them vao dong dang doc
    if (currentQuestion) {
      if (currentQuestion.options.length === 0) {
        currentQuestion.question += " " + line;
      } else {
        const lastOpt = currentQuestion.options[currentQuestion.options.length - 1];
        lastOpt.text += " " + line;
      }
    }
  }

  if (currentQuestion && currentQuestion.options.length > 0) {
    questions.push(currentQuestion);
  }

  return questions;
}
