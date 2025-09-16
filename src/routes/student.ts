import { Request, Response, Router } from "express";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParamExammaRayId, validateParamUuid } from "./common";
import { db_getLiveExamAssignmentByExamUuid, db_getLiveExamAssignmentsByEmail, db_getLiveExamInstanceByUuid, db_getStudentExamInfoByUuid, db_getStudentExamsInfoByEmail, db_getWindowByUuid, db_saveLiveExamSubmission } from "../db/db_live";
import { db_getUserByEmail } from "../db/db_user";
import { ExamSessionInfo } from "../rest_types";

export const student_router = Router();
student_router
  .route("/exams")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      return res.status(200).json(await db_getStudentExamsInfoByEmail(userInfo.email))
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

student_router.route("/exams/:exam_uuid/session")
  .get(createRoute({
    preprocessing: [
      jsonBodyParser,
    ],
    validation: [
      validateParamUuid("exam_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      const exam_uuid = req.params["exam_uuid"];

      const exam_assn = await db_getLiveExamAssignmentByExamUuid(exam_uuid);
      if (!exam_assn) {
        console.log(`Live exam ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

      if (exam_assn.student_email !== userInfo.email) {
        console.log(`Live exam FORBIDDEN: ${userInfo.email} not authorized to access exam ${exam_uuid} for ${exam_assn.uniqname} (${exam_assn.student_email})`);
        return res.sendStatus(404); // 404 and not 403 - don't reveal existence
      }
      
      const exam_instance = await db_getLiveExamInstanceByUuid(exam_assn.exam_instance_uuid);
      if (!exam_instance) {
        console.log(`Live exam ERROR: No such exam instance ${exam_assn.exam_instance_uuid} for exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

      const exam_window = exam_assn.window_uuid
        ? await db_getWindowByUuid(exam_assn.window_uuid)
        : undefined;

      const result : ExamSessionInfo = {
        exam_uuid: exam_assn.exam_uuid,
        start_time: exam_assn.start_time,
        exam_window: exam_window ? {
          name: exam_window.name,
          open_time: exam_window.open_time,
          close_time: exam_window.close_time,
        } : undefined,
        now: new Date(),
        duration_seconds: exam_instance.duration_seconds,
        force_open: exam_assn.force_open,
        duration_multiplier: exam_assn.duration_multiplier,
      };


      console.log(`Live exam SESSION checked: ${userInfo.email} taking exam ${exam_uuid} for ${exam_assn.uniqname} (${exam_assn.student_email})`);
      
      return res.status(200).json(result)
    },
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

      const exam_instance = await db_getLiveExamInstanceByUuid(exam_info.exam_instance_uuid);
      if (!exam_instance) {
        console.log(`Live exam ERROR: No such exam instance ${exam_info.exam_instance_uuid} for exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

      // 30 seconds grace period to ensure frontend can get it one final save
      const grace_period_ms = 30 * 1000;

      // Are we within the allowed window if there is one?
      if (!exam_info.force_open) {
        if(!exam_info.window_uuid) {
          console.log(`Live exam ERROR: No window defined for exam ${exam_uuid} attempted by ${userInfo.email}`);
          return res.sendStatus(404);
        }
        const window = await db_getWindowByUuid(exam_info.window_uuid);
        if (!window) {
          console.log(`Live exam ERROR: No such window ${exam_info.window_uuid} for exam ${exam_uuid} attempted by ${userInfo.email}`);
          return res.sendStatus(404);
        }

        const now = new Date();
        if (now.getTime() < new Date(window.open_time).getTime() || now.getTime() >= new Date(window.close_time).getTime() + grace_period_ms) {
          console.log(`Live exam FORBIDDEN: ${userInfo.email} attempted to access exam ${exam_uuid} outside of window ${window.name} (${window.open_time} - ${window.close_time})`);
          return res.sendStatus(403);
        }
        const duration_ms = exam_instance.duration_seconds * exam_info.duration_multiplier * 1000;
        // If the exam has a duration, are we within that time limit?
        if (exam_info.start_time && exam_info.start_time.getTime() + duration_ms < now.getTime() - grace_period_ms) {
          console.log(`Live submission FORBIDDEN: ${userInfo.email} attempted to submit for exam ${exam_uuid} after time limit expired`);
          return res.sendStatus(403);
        }
      }

      console.log(`Live submission SUCCESS: Saving submission from ${userInfo.email} for exam ${exam_uuid} for ${exam_info.uniqname} (${exam_info.student_email})`);
      return res.status(200).json(await db_saveLiveExamSubmission(
        exam_uuid, userInfo.email, req.body.submission
      ));
    },
  }));