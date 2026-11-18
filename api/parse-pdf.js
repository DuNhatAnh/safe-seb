const pdfParse = require("pdf-parse");

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB

async function parsePdfHandler(req, res) {
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
    // Thu thap du lieu buffer tu raw request
    const chunks = [];
    let totalSize = 0;

    for await (const chunk of req) {
      totalSize += chunk.length;
      if (totalSize > MAX_PDF_SIZE) {
        return res.status(400).json({ error: "Dung luong file PDF vuot qua gioi han 10MB" });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Khong nhan duoc du lieu file PDF" });
    }

    // Kiem tra magic bytes %PDF
    if (buffer.length < 5 || buffer.slice(0, 4).toString() !== "%PDF") {
      return res.status(400).json({ error: "Du lieu khong phai file PDF hop le" });
    }

    // Doc van ban tu PDF bang pdf-parse
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text || "";

    if (!rawText.trim()) {
      return res.status(400).json({
        error: "PDF khong co lop van ban (co the la ban scan). Hay xuat PDF tu Word/Google Docs."
      });
    }

    // Phan tich va boc tach cau hoi tu van ban
    const questions = extractQuestionsFromText(rawText);

    // Kiem tra canh bao dap an cho tung cau
    const warnings = [];
    questions.forEach((q, idx) => {
      const n = idx + 1;
      const correctCount = q.options.filter(o => o.is_correct).length;
      if (q.options.length < 2) {
        warnings.push(`Cau ${n}: co it hon 2 phuong an`);
      }
      if (correctCount === 0) {
        warnings.push(`Cau ${n}: chua co dap an dung`);
      } else if (correctCount > 1) {
        warnings.push(`Cau ${n}: co ${correctCount} dap an dung`);
      }
    });

    return res.status(200).json({
      success: true,
      total_questions: questions.length,
      questions,
      warnings
    });
  } catch (err) {
    return res.status(500).json({ error: "Loi xu ly file PDF: " + err.message });
  }
}

// Ham tach cau hoi va phat hien phuong an dap an dung
function extractQuestionsFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const questions = [];
  let currentQuestion = null;

  // Cac ky tu khoanh tron Unicode chuan (Circled Latin Letters Ⓐ-Ⓓ)
  const circledLetters = {
    "\u24B6": "A",
    "\u24B7": "B",
    "\u24B8": "C",
    "\u24B9": "D"
  };

  const optionLetters = ["A", "B", "C", "D"];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Kiem tra dong Dap an: X (vi du: "Dap an: B", "Đáp án: B", "Answer: C")
    const ansMatch = line.match(/^(?:[dđ][áa]p\s*[áa]n|answer)[\s.:-]+([A-D])\b/i);
    if (ansMatch && currentQuestion && currentQuestion.options.length > 0) {
      const targetLetter = ansMatch[1].toUpperCase();
      const targetIdx = optionLetters.indexOf(targetLetter);
      if (targetIdx >= 0 && targetIdx < currentQuestion.options.length) {
        // Dat phuong an tuong ung la dung
        currentQuestion.options.forEach((opt, idx) => {
          if (idx === targetIdx) opt.is_correct = true;
        });
      }
      continue;
    }

    // 2. Nhan dien bat dau mot cau hoi: "Cau 1:", "Cau 1.", "Bai 1:", hoac "1." / "1)" (so di lien dau cau roi cach ra)
    const qMatch = line.match(/^(?:c[âa]u\s*\d+|b[àa]i\s*\d+)[\s.:-]+(.*)/i) ||
                   line.match(/^(\d+)[\.:\)](?:\s+)(.*)/);

    if (qMatch) {
      if (currentQuestion && currentQuestion.options.length > 0) {
        questions.push(currentQuestion);
      }
      const qText = qMatch[qMatch.length - 1].trim();
      currentQuestion = {
        question: qText || line,
        options: []
      };
      continue;
    }

    // 3. Nhan dien phuong an A, B, C, D (khong dung co /i de tranh bat nham chu thuong dau cau)
    // Ho tro: A., A), A:, (A), [A], *A., *B), Ⓐ, Ⓑ...
    const optMatch = line.match(/^(\*?\s*)([A-D]|[\u24B6-\u24B9]|\([A-D]\)|\[[A-D]\])[\s.:\)-]+(.*)/);
    if (optMatch && currentQuestion) {
      const hasStar = optMatch[1].includes("*");
      const rawToken = optMatch[2];
      const optText = optMatch[3].trim();

      const isCircled = rawToken in circledLetters;
      const isCorrect = hasStar || isCircled;

      currentQuestion.options.push({
        text: optText,
        is_correct: isCorrect
      });
      continue;
    }

    // 4. Dong noi tiep van ban
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

module.exports = parsePdfHandler;
module.exports.extractQuestionsFromText = extractQuestionsFromText;
