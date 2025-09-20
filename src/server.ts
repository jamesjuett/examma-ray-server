import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';

import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { readdirSync } from 'fs';
import passport from 'passport';
import path from 'path';
import { requireAdmin, requireStaff } from './auth/jwt_auth';
import { ExammaRayServer } from './ExammaRayGradingServer';
import { auth_router } from './routes/auth';
import { exams_router } from './routes/exams';
import { manual_grading_router } from './routes/manual_grading';
import { run_router } from './routes/run';
import { users_router } from './routes/users';
import { participation_router } from './routes/participation';
import { student_router } from './routes/student';
import { assigned_exams } from './routes/assigned_exams';
import { live_exams_router } from './routes/live';

export let EXAMMA_RAY_GRADING_SERVER: ExammaRayServer;

async function main() {

  EXAMMA_RAY_GRADING_SERVER = await ExammaRayServer.create(
    readdirSync("data", "utf8").map(
      exam_id => ExamUtils.readExamSpecificationFromFileSync(
        path.join("data", exam_id, "exam-spec.json")
      )
    )
  );

  console.log("Creating express app...");
  const app = express();

  console.log("Creating routes...");
  // Requests to /staff and /out allow authentication via a bearer
  // token stored in a cookie. These routes are used ONLY to serve
  // files via GET requests. None of these routes perform any state
  // changing actions or have side effects, so CSRF (which cookie
  // authentication would allow) is not a big concern.
  // THe relevant cookie is set with secure and sameSite=strict flags.
  app.use('/staff',
    cookieParser(),
    passport.initialize(),
    passport.authenticate('jwt-cookie', { session: false }),
    requireStaff,
    express.static("staff")
  );
  app.use('/out',
    cookieParser(),
    passport.initialize(),
    passport.authenticate('jwt-cookie', { session: false }),
    requireStaff,
    express.static("out")
  );

  // Requests to live exam files allow authentication via a bearer
  // token stored in a cookie. These routes are used ONLY to serve
  // files via GET requests. None of these routes perform any state
  // changing actions or have side effects, so CSRF (which cookie
  // authentication would allow) is not a big concern.
  // THe relevant cookie is set with secure and sameSite=strict flags.
  app.use('/live',
    cookieParser(),
    passport.initialize(),
    passport.authenticate('jwt-cookie', { session: false }),
    live_exams_router, // if unauthorized here, will not call next() and not go to express.static below
    express.static("live")
  );

  // ALL requests to the api require authentication via a bearer
  // token in the request authorization header
  app.use('/api',
    passport.initialize(),
    passport.authenticate('jwt-bearer', { session: false }),
    requireStaff,
  );

  // Regular API Routes
  app.use("/api/users", users_router);
  app.use("/api/exams", exams_router);
  app.use("/api/assigned_exams", assigned_exams);
  // app.use("/api/questions", questions_router);
  app.use("/api/manual_grading", manual_grading_router);

  // Separate student API routes, require authentication but
  // do not require any additional staff authorization
  app.use('/student_api',
    passport.initialize(),
    passport.authenticate('jwt-bearer', { session: false }),
    student_router
  );


  // Routes to run jobs, which require authentication via a bearer
  // token in the request authorization header
  app.use('/run',
    passport.initialize(),
    passport.authenticate('jwt-bearer', { session: false }),
    requireAdmin,
    run_router
  );

  // Public API routes do not require authentication
  app.use("/public_api/participation", participation_router);

  // Route to obtain authentication
  // (does not require prior authentication)
  app.use("/auth", auth_router);

  // Serve static files out of public
  app.use(express.static("public"));

  // Swagger API docs
  // app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

  // Generic error handler
  // Basically indicates we missed something oops
  app.use( (err: any, req: Request, res: Response, next: NextFunction) => {
    console.log(err);
    res.sendStatus(500);
  });


  console.log("Launching server...");
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log(`Server is running at https://localhost:${PORT}`);
  });

}

main();