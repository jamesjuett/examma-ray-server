import { Request, Response, Router } from "express";
import { query } from "../db/db";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParam } from "./common";
import { Worker } from "worker_threads";
import { readFileSync } from "fs";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { RunGradingRequest } from "../dashboard";
const validateParamExamId = validateParam("exam_id").trim().isLength({min: 1, max: 100});
// const validateParamTerm = validateParam("term").isIn(["fall", "winter", "spring", "summer"]);
// const validateParamYear = validateParam("year").isInt();

// const validateBodyShortName = validateBody("short_name").trim().isLength({min: 1, max: 20});
// const validateBodyFullName = validateBody("full_name").trim().isLength({min: 1, max: 100});
// const validateBodyTerm = validateBody("term").isIn(["fall", "winter", "spring", "summer"]);
// const validateBodyYear = validateBody("year").isInt();

// const validateBodyCourse = [
//   validateBodyShortName,
//   validateBodyFullName,
//   validateBodyTerm,
//   validateBodyYear
// ];



// async function requireCourseAdmin(req: Request, res: Response, next: NextFunction) {
//   let user_id = getJwtUserInfo(req).id;
//   let course_id = parseInt(req.params["id"]);

//   if (await isCourseAdmin(user_id, course_id)) {
//     return next();
//   }
//   else {
//     // Not authorized
//     res.sendStatus(403);
//   }

// }

// export const getCoursesRoute = createRoute({
//   preprocessing: NO_PREPROCESSING,
//   validation: NO_VALIDATION,
//   authorization: NO_AUTHORIZATION,
//   handler: async (req: Request, res: Response) => {
//     res.status(200);
//     res.json(await query("courses").select());
//   }
// });


// export const getCourseByIdRoute = createRoute({
//   preprocessing: NO_PREPROCESSING,
//   validation: validateParamId,
//   authorization: NO_AUTHORIZATION,
//   handler: async (req: Request, res: Response) => {
//     let course = await getCourse(parseInt(req.params["id"]));
//     if (course) {
//       res.status(200);
//       res.json(course);
//     }
//     else {
//       res.status(404);
//       res.send("This course does not exist.");
//     }
//   }
// });

// export const getCourseByShortNameTermYearRoute = createRoute({
//   preprocessing: NO_PREPROCESSING,
//   validation: [
//     validateParamShortName,
//     validateParamTerm,
//     validateParamYear,
//   ],
//   authorization: NO_AUTHORIZATION,
//   handler: async (req: Request, res: Response) => {
//     let course = getCourseByShortNameTermYear(
//       req.params["short_name"],
//       req.params["term"],
//       parseInt(req.params["year"])
//     );
      
//     if (course) {
//       res.status(200);
//       res.json(course);
//     }
//     else {
//       res.status(404);
//       res.send("This course does not exist.");
//     }
//   }
// });


export const run_router = Router();
run_router
  .route("/grade/:exam_id")
    .post(createRoute({
      authorization: NO_AUTHORIZATION,
      preprocessing: jsonBodyParser,
      validation: [
        validateParamExamId,
        validateBody("reports").isBoolean({strict: true}),
        validateBody("curve").isBoolean({strict: true}),
        validateBody("target_mean").isNumeric().optional(),
        validateBody("target_stddev").isNumeric().optional(),
      ],
      handler: (req: Request, res: Response) => {

        let run_request = <RunGradingRequest>req.body;

        const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
        if (!exam) {
          res.sendStatus(404);
          return;
        }
  
        if (exam.taskStatus["grade"]) {
          res.status(200).json("A grading task is already running. Please wait for it to finish.");
          return;
        }
  
        exam.gradeExams(run_request);
        res.status(200).json(run_request.reports ? "Report generation started..." : "Grading run started...");
      }
    }));


