import { Request, Response, Router } from "express";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParamExammaRayId, validateParamUuid } from "./common";
import { db_getLiveExamAssignmentByExamUuid, db_getLiveExamAssignmentsByEmail, db_saveLiveExamSubmission } from "../db/db_live";
import { db_getUserByEmail } from "../db/db_user";

export const student_router = Router();
student_router
  .route("/exams")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      return res.status(200).json(await db_getLiveExamAssignmentsByEmail(userInfo.email));
    }
  }));

student_router.route("/users/me")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      let userInfo = getJwtUserInfo(req);
      let user = await db_getUserByEmail(userInfo.email);
      if (user) {
        res.status(200);
        res.json(user);
      }
      else {
        res.status(404);
        res.send("This user does not exist.");
      }
    }
  }));

student_router.route("/exams/:exam_uuid/live_submission")
  .put(createRoute({
    preprocessing: [
      jsonBodyParser,
    ],
    validation: [
      validateParamUuid("exam_uuid"),
      validateBody("submission").isString().trim().isLength({min: 1, max: 1000000}),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      const exam_uuid = req.params["exam_uuid"];

      const exam_info = await db_getLiveExamAssignmentByExamUuid(exam_uuid);
      if (!exam_info) {
        console.log(`Live submission ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

      if (exam_info.student_email !== userInfo.email) {
        console.log(`Live submission FORBIDDEN: ${userInfo.email} not authorized to submit for exam ${exam_uuid} for ${exam_info.uniqname} (${exam_info.student_email})`);
        return res.sendStatus(404); // 404 and not 403 - don't reveal existence
      }

      console.log(`Live submission SUCCESS: Saving submission from ${userInfo.email} for exam ${exam_uuid} for ${exam_info.uniqname} (${exam_info.student_email})`);
      return res.status(200).json(await db_saveLiveExamSubmission(
        exam_uuid, userInfo.email, req.body.submission
      ));
    },
  }));