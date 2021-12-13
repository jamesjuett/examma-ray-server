import { Request, Response, Router } from "express";
import { query } from "../db/db";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParam, validateParamExammaRayId } from "./common";
import { Worker } from "worker_threads";
import { readFileSync } from "fs";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { db_getManualGradingRecords, db_getManualGradingRubric } from "../db/db_rubrics";
import { ManualCodeGraderConfiguration, ManualGradingPingRequest, ManualGradingRubricItem } from "../manual_grading";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { db_getCodeGraderConfig } from "../db/db_code_grader";
const validateParamQuestionId = validateParam("question_id").trim().isLength({min: 1, max: 100});
const validateBodyQuestionId = validateBody("question_id").trim().isLength({min: 1, max: 100});
const validateBodyGroupId = validateBody("group_id").trim().isLength({min: 1, max: 100});
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


export const manual_grading_router = Router();

    
manual_grading_router
  .route("/:exam_id/questions/:question_id/rubric")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamQuestionId
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]]?.getGradingServer(req.params["question_id"]);
        if (qs) {
          return res.status(200).json(qs.rubric);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));
    
manual_grading_router
  .route("/:question_id/config")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamQuestionId
      ],
      handler: async (req: Request, res: Response) => {
        const result: ManualCodeGraderConfiguration | undefined = await db_getCodeGraderConfig(req.params["question_id"])
        if (result) {
          return res.status(200).json(result);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));

manual_grading_router
  .route("/:exam_id/questions/:question_id/ping")
    .post(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: jsonBodyParser,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
        validateBodyGroupId.optional(),
        validateBody("my_grading_epoch").isInt().optional()
      ],
      handler: async (req: Request, res: Response) => {
        let userInfo = getJwtUserInfo(req);
        let pr = <ManualGradingPingRequest>req.body;
        let qs = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]]?.getGradingServer(req.params["question_id"]);
        if (qs) {
          return res.status(200).json(await qs.processManualGradingPing(userInfo.email, pr));
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));

manual_grading_router
  .route("/:exam_id/questions/:question_id/records")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]]?.getGradingServer(req.params["question_id"]);
        if (qs) {
          return res.status(200).json(qs.grading_record);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));


manual_grading_router
  .route("/:exam_id/questions/:question_id/skins")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]]?.getGradingServer(req.params["question_id"]);
        if (qs) {
          return res.status(200).json(qs.skins);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));


manual_grading_router
  .route("/:exam_id/questions/:question_id/config")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]]?.getGradingServer(req.params["question_id"]);
        if (qs) {
          return res.status(200).json(qs.config);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));