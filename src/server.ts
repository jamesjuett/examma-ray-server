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
import { grading_router } from './routes/grade';

const app = express();

app.get('/',
  (req,res) => res.send('Hi this is the Lobster REST API')
);

// ALL requests to the regular api require authentication
app.use('/api',
  passport.initialize(),
  passport.authenticate('jwt-bearer', { session: false })
);

app.use('/exams',
  cookieParser(),
  passport.initialize(),
  passport.authenticate('jwt-cookie', { session: false }),
  express.static("exams")
);

// Regular API Routes
app.use("/api/users", users_router);
app.use("/api/grade", grading_router);
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
  console.log(`⚡️[server]: Server is running at https://localhost:${PORT}`);
});