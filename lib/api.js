// Diem lap rap backend (composition root): tao cac doi tuong va noi phu thuoc.
// Dung chung cho server.js (chay local) va api/index.js (Vercel).
//
//   http/Router  ->  controllers/*  ->  services/*  ->  repositories/*  ->  db/SupabaseClient
//
// Muon test 1 service: tao service voi repository gia (khong can server hay Supabase).
const { Config } = require("./config");
const { SupabaseClient } = require("./db/SupabaseClient");
const { ExamRepository } = require("./repositories/ExamRepository");
const { ResultRepository } = require("./repositories/ResultRepository");
const { EventRepository } = require("./repositories/EventRepository");
const { RateLimiter } = require("./security/RateLimiter");
const { GradingService } = require("./services/GradingService");
const { ExamService } = require("./services/ExamService");
const { SubmissionService } = require("./services/SubmissionService");
const { ProctorService } = require("./services/ProctorService");
const { AuthService } = require("./services/AuthService");
const { AdminDataService } = require("./services/AdminDataService");
const { Router } = require("./http/Router");
const { StudentController } = require("./controllers/StudentController");
const { AdminController } = require("./controllers/AdminController");

function createApi({ config = new Config(), fetchImpl } = {}) {
  const db = new SupabaseClient(config, fetchImpl);

  const exams = new ExamRepository(db);
  const results = new ResultRepository(db);
  const events = new EventRepository(db);

  const grading = new GradingService();
  const examService = new ExamService({ exams, results, grading });
  const submissionService = new SubmissionService({ examService, results, grading });
  const proctorService = new ProctorService({ config, events, limiter: new RateLimiter() });
  const authService = new AuthService({ config, limiter: new RateLimiter() });
  const adminDataService = new AdminDataService({ db });

  const router = new Router();
  new StudentController({ examService, submissionService, proctorService }).register(router);
  new AdminController({ authService, adminDataService }).register(router);
  return router;
}

const api = createApi();

module.exports = { handle: api.handle, createApi };
