import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';

import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { readdirSync } from 'fs';
import passport from 'passport';
import path from 'path';
import { requireStaff } from './auth/jwt_auth';
import { ExammaRayGradingServer } from './ExammaRayGradingServer';
import { auth_router } from './routes/auth';
import { exams_router } from './routes/exams';
import { manual_grading_router } from './routes/manual_grading';
import { questions_router } from './routes/questions';
import { run_router } from './routes/run';
import { users_router } from './routes/users';

export let EXAMMA_RAY_GRADING_SERVER: ExammaRayGradingServer;

async function main() {

  EXAMMA_RAY_GRADING_SERVER = await ExammaRayGradingServer.create(
    readdirSync("data", "utf8").map(
      exam_id => ExamUtils.readExamSpecificationFromFileSync(
        path.join("data", exam_id, "exam-spec.json")
      )
    )
  );

  const app = express();

  // Requests to output files allow authentication via a bearer
  // token stored in a cookie. These routes are used ONLY to serve
  // files via GET requests. None of these routes perform any state
  // changing actions or have side effects, so CSRF (which cookie
  // authentication would allow) is not a big concern.
  app.use('/out',
    cookieParser(),
    passport.initialize(),
    passport.authenticate('jwt-cookie', { session: false }),
    requireStaff,
    express.static("out")
  );

  // ALL requests to the api require authentication via a bearer
  // token in the request authorization header
  app.use('/api',
    passport.initialize(),
    passport.authenticate('jwt-bearer', { session: false }),
    requireStaff
  );

  // Regular API Routes
  app.use("/api/users", users_router);
  app.use("/api/exams", exams_router);
  app.use("/api/questions", questions_router);
  app.use("/api/manual_grading", manual_grading_router);


  // Routes to run jobs, which require authentication via a bearer
  // token in the request authorization header
  app.use('/run',
    passport.initialize(),
    passport.authenticate('jwt-bearer', { session: false }),
    requireStaff,
    run_router
  );

  // app.use("/api/projects", projects_router);
  // app.use("/api/courses", courses_router);
  // app.use("/api/exercises", exercises_router);

  // Public API routes do not require authentication
  // app.use("/public_api", public_router);

  // Route to obtain authentication
  // (does not require prior authentication)
  app.use("/auth", auth_router);

  // Swagger API docs
  // app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

  // Generic error handler
  // Basically indicates we missed something oops
  app.use( (err: any, req: Request, res: Response, next: NextFunction) => {
    console.log(err);
    res.sendStatus(500);
  });



  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server is running at https://localhost:${PORT}`);
  });

}

main();