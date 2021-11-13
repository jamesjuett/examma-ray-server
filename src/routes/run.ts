import { Request, Response, Router } from "express";
import { query } from "../db/db";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateParam } from "./common";
import { Worker } from "worker_threads";
import { readFileSync } from "fs";
import { EXAMMA_RAY_GRADER } from "../server";
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

export function createGradeRoute(reports: boolean) {
  return createRoute({
    authorization: NO_AUTHORIZATION, // requireSuperUser,
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExamId
    ],
    handler: async (req: Request, res: Response) => {
      const exam_spec = EXAMMA_RAY_GRADER.exam_specs_by_id[req.params["exam_id"]];
      if (!exam_spec) {
        res.sendStatus(404);
        return;
      }

      const grader_spec = {
        uuid_strategy: "uuidv5",
        uuidv5_namespace: readFileSync(`data/${exam_spec?.exam_id}/secret`, "utf-8"),
        frontend_js_path: "js/frontend-graded.js",
      };

      const worker = new Worker("./build/run/grade.js", {
        workerData: {
          exam_id: exam_spec.exam_id,
          grader_spec: grader_spec,
          reports: reports
        }
      })
      
      res.status(200).json(reports ? "Report generation started..." : "Grading run started...");
    }
  })
}

export const run_router = Router();
run_router
  .route("/grade/:exam_id")
    .post(createGradeRoute(false));
run_router
  .route("/reports/:exam_id")
    .post(createGradeRoute(true));
