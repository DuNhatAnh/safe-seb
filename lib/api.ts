// Diem lap rap backend (composition root): tao cac doi tuong va noi phu thuoc.
// Dung chung cho server.ts (chay local) va api/index.js (Vercel, ban da build trong dist/).
//
//   http/Router -> controllers/* -> services/* -> repositories/* -> infra/database/Database (interface)
//                                                                     -> SupabaseDatabase (cai dat that)
//
// Muon test 1 service: tao service voi repository gia (khong can server hay Supabase).
import { Config } from "./config.ts";
import { AdminController } from "./controllers/AdminController.ts";
import { StudentController } from "./controllers/StudentController.ts";
import { Router } from "./http/Router.ts";
import { SupabaseDatabase } from "./infra/database/SupabaseDatabase.ts";
import { EventRepository } from "./repositories/EventRepository.ts";
import { ExamRepository } from "./repositories/ExamRepository.ts";
import { ResultRepository } from "./repositories/ResultRepository.ts";
import { RateLimiter } from "./security/RateLimiter.ts";
import { AdminDataService } from "./services/AdminDataService.ts";
import { AttemptService } from "./services/AttemptService.ts";
import { AuthService } from "./services/AuthService.ts";
import { EntryPasswordService } from "./services/EntryPasswordService.ts";
import { ExamService } from "./services/ExamService.ts";
import { GradingService } from "./services/GradingService.ts";
import { ProctorCodeService } from "./services/ProctorCodeService.ts";
import { ProctorService } from "./services/ProctorService.ts";
import { SebConfigService } from "./services/SebConfigService.ts";
import { SubmissionService } from "./services/SubmissionService.ts";

export interface CreateApiOptions {
  config?: Config;
  fetchImpl?: typeof fetch;
}

export function createApi({ config = new Config(), fetchImpl }: CreateApiOptions = {}): Router {
  const db = new SupabaseDatabase(config, fetchImpl);

  const exams = new ExamRepository(db);
  const results = new ResultRepository(db);
  const events = new EventRepository(db);

  const grading = new GradingService();
  const attempts = new AttemptService({ results, events });
  const entryPasswordService = new EntryPasswordService({ config, exams, events, limiter: new RateLimiter() });
  const examService = new ExamService({ exams, attempts, grading, entryPasswords: entryPasswordService });
  const submissionService = new SubmissionService({ examService, results, attempts, grading });
  const sebConfigService = new SebConfigService({ config, exams });
  const proctorService = new ProctorService({
    config, exams, events, attempts, limiter: new RateLimiter(),
    sebQuitUrl: (examId, origin) => sebConfigService.quitUrl(examId, origin)
  });
  const proctorCodeService = new ProctorCodeService({ exams });
  const authService = new AuthService({ config, limiter: new RateLimiter() });
  const adminDataService = new AdminDataService({ db });

  const router = new Router();
  new StudentController({ examService, submissionService, proctorService, sebConfigService }).register(router);
  new AdminController({ authService, adminDataService, proctorCodeService, sebConfigService, entryPasswordService }).register(router);
  return router;
}

export const handle = createApi().handle;
