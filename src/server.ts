import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';

// import { projects_router } from './routes/projects';
// import { courses_router } from './routes/courses';
import passport from 'passport';
import { auth_router } from './routes/auth';
// import { public_router } from './routes/public';
import { users_router } from './routes/users';
import { assert } from 'console';
// import { exercises_router } from './routes/exercises';
import path from 'path';
import { run_router } from './routes/run';
import { ExammaRayGradingServer } from './ExammaRayGradingServer';
import { readdirSync } from 'fs';
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { Exam } from "examma-ray";
import { exams_router } from './routes/exams';
import { manual_grading_router } from './routes/manual_grading';
import { questions_router } from './routes/questions';
import { getJwtUserInfo } from './auth/jwt_auth';

export let EXAMMA_RAY_GRADING_SERVER: ExammaRayGradingServer;

const STAFF = new Set<string>([
  "abifox@umich.edu",
  "aravikum@umich.edu",
  "aelhamah@umich.edu",
  "adaines@umich.edu",
  "stoneann@umich.edu",
  "sarangia@umich.edu",
  "ajamalud@umich.edu",
  "ashpatel@umich.edu",
  "ashleyac@umich.edu",
  "ashvink@umich.edu",
  "bkayes@umich.edu",
  "brightxu@umich.edu",
  "ciheanyi@umich.edu",
  "chrzhang@umich.edu",
  "clsun@umich.edu",
  "babila@umich.edu",
  "danlliu@umich.edu",
  "divyaram@umich.edu",
  "eylu@umich.edu",
  "fiahmed@umich.edu",
  "gsev@umich.edu",
  "gurish@umich.edu",
  "hniswand@umich.edu",
  "iabouara@umich.edu",
  "imanmal@umich.edu",
  "jjuett@umich.edu",
  "wengj@umich.edu",
  "houghj@umich.edu",
  "jbbeau@umich.edu",
  "macekj@umich.edu",
  "joshsieg@umich.edu",
  "jcaoun@umich.edu",
  "jsliu@umich.edu",
  "metzkm@umich.edu",
  "kamiz@umich.edu",
  "leheng@umich.edu",
  "fimaria@umich.edu",
  "mariamhm@umich.edu",
  "mipeng@umich.edu",
  "mmliu@umich.edu",
  "saputran@umich.edu",
  "nehark@umich.edu",
  "nishuk@umich.edu",
  "omidsh@umich.edu",
  "ptaneja@umich.edu",
  "congq@umich.edu",
  "qinjuanx@umich.edu",
  "rnag@umich.edu",
  "rosendon@umich.edu",
  "rushilk@umich.edu",
  "sjaehnig@umich.edu",
  "schabseb@umich.edu",
  "patis@umich.edu",
  "sofias@umich.edu",
  "yiranshi@umich.edu",
  "unserh@umich.edu",
  "vrnayak@umich.edu",
  "qwzhao@umich.edu",
  "wsoltas@umich.edu",
  "zccarey@umich.edu",
  "zwgold@umich.edu",
  "zalsaedy@umich.edu",
  "schatzju@umich.edu"
]);

function requireStaff(req: Request, res: Response, next: NextFunction) {
  let userInfo = getJwtUserInfo(req);
  if (STAFF.has(userInfo.email)) {
    next();
  }
  else {
    res.sendStatus(403);
    console.log(`Blocked access by: ${userInfo.email}`);
  }
}

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