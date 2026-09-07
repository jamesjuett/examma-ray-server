import { Request, Response, Router } from "express";
import { getJwtUserInfo, isAdmin, isStaff } from "../auth/jwt_auth";
import { db_getStudentExamsInfoByEmail, db_saveLiveExamSubmission } from "../db/db_live";
import { db_getUserByEmail } from "../db/db_user";
import { StudentFacingExamSessionInfo } from "../rest_types";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser_small_1MB, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParamUuid } from "./common";
import { isDurationExpired, isWithinWindow } from "../util/util";
import { now } from "jquery";
import rateLimit from "express-rate-limit";


export const student_router = Router();
student_router
  .route("/exams")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      return res.status(200).json({
        exams: await db_getStudentExamsInfoByEmail(userInfo.email),
        now: Date.now()
      })
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
        res.json(Object.assign(user,{
          is_staff: isStaff(user.email),
          is_admin: isAdmin(user.email)
        }));
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
      jsonBodyParser_small_1MB, // TODO: I don't think we need to parse a body here
    ],
    validation: [
      validateParamUuid("exam_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      const exam_uuid = req.params["exam_uuid"];

      const found = EXAMMA_RAY_GRADING_SERVER.getAssignedExamByUuid(exam_uuid);
      if (!found) {
        console.log(`Live exam ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }
      const { exam_instance, assigned_exam } = found;

      if (assigned_exam.student_email !== userInfo.email) {
        console.log(`Live exam FORBIDDEN: ${userInfo.email} not authorized to access exam ${exam_uuid} for ${assigned_exam.uniqname} (${assigned_exam.student_email})`);
        return res.sendStatus(404); // 404 and not 403 - don't reveal existence
      }

      const exam_window = assigned_exam.window_uuid
        ? exam_instance.getWindowByUuid(assigned_exam.window_uuid)
        : undefined;

      const now_ms = Date.now();

      // If there was no start time (generally should only happen if time is reset by staff while
      // a student is already on the exam page, otherwise it would be set when they open the exam),
      // then we go ahead and set it to now. We don't do this if the access is outside the window,
      // since this plays more nicely with piecemeal resets of the exam (e.g. a student has time
      // reset and also is moved to a later window).

      if (assigned_exam.force_open || (exam_window && isWithinWindow(exam_window.open_time, exam_window.close_time, now_ms))) {
        await exam_instance.startAssignedExamByUuid(exam_uuid);
      }

      const result : StudentFacingExamSessionInfo = {
        exam_uuid: assigned_exam.exam_uuid,
        start_time: assigned_exam.start_time,
        exam_window: exam_window ? {
          name: exam_window.name,
          open_time: exam_window.open_time,
          close_time: exam_window.close_time,
        } : undefined,
        now: now_ms,
        duration_seconds: exam_instance.duration_seconds,
        force_open: assigned_exam.force_open,
        duration_multiplier: assigned_exam.duration_multiplier,
      };

      console.log(`Live exam SESSION checked: ${userInfo.email} taking exam ${exam_uuid} for ${assigned_exam.uniqname} (${assigned_exam.student_email})`);
      
      return res.status(200).json(result)
    },
  }));

  
// rate limit these routes to prevent abuse.
const student_submission_rate_limiter = rateLimit({
  windowMs: 10000, // 10 seconds
  limit: 10, // up to 10 requests per 10s window (generous, given expected 1 per 5 seconds taking an exam)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, res: Response) => {
    const userInfo = getJwtUserInfo(req);
    return userInfo.email;
  }
});

student_router.route("/exams/:exam_uuid/live_submission")
  
  .put(createRoute({
    preprocessing: [
      jsonBodyParser_small_1MB, // should be fairly generous - largest submissions with current question types are generally ~10KB
    ],
    validation: [
      validateParamUuid("exam_uuid"),
      validateBody("submission").isString().trim().isLength({min: 1, max: 1000000}),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: [
      student_submission_rate_limiter,
      async (req: Request, res: Response) => {
        const userInfo = getJwtUserInfo(req);
        const exam_uuid = req.params["exam_uuid"];

        const found = EXAMMA_RAY_GRADING_SERVER.getAssignedExamByUuid(exam_uuid);
        if (!found) {
          console.log(`Live submission ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
          return res.sendStatus(404);
        }
        const { exam_instance, assigned_exam } = found;

        if (assigned_exam.student_email !== userInfo.email) {
          console.log(`Live submission FORBIDDEN: ${userInfo.email} not authorized to submit for exam ${exam_uuid} for ${assigned_exam.uniqname} (${assigned_exam.student_email})`);
          return res.sendStatus(404); // 404 and not 403 - don't reveal existence
        }

        // 30 seconds grace period to ensure frontend can get it one final save
        const grace_period_ms = 30 * 1000;

        // Are we within the allowed window if there is one?
        if (!assigned_exam.force_open) {
          if(!assigned_exam.window_uuid) {
            console.log(`Live exam ERROR: No window defined for exam ${exam_uuid} attempted by ${userInfo.email}`);
            return res.sendStatus(404);
          }
          const window = exam_instance.getWindowByUuid(assigned_exam.window_uuid);
          if (!window) {
            console.log(`Live exam ERROR: No such window ${assigned_exam.window_uuid} for exam ${exam_uuid} attempted by ${userInfo.email}`);
            return res.sendStatus(404);
          }

          const now_ms = Date.now();
          if (!isWithinWindow(window.open_time, window.close_time, now_ms, grace_period_ms)) {
            console.log(`Live exam FORBIDDEN: ${userInfo.email} attempted to access exam ${exam_uuid} outside of window ${window.name} (${window.open_time} - ${window.close_time})`);
            return res.sendStatus(403);
          }
          // If the exam has a duration, are we within that time limit?
          if (isDurationExpired(exam_instance.duration_seconds, assigned_exam.duration_multiplier, assigned_exam.start_time, now_ms, grace_period_ms)) {
            console.log(`Live submission FORBIDDEN: ${userInfo.email} attempted to submit for exam ${exam_uuid} after time limit expired`);
            return res.sendStatus(403);
          }
        }

        console.log(`Live submission SUCCESS: Saving submission from ${userInfo.email} for exam ${exam_uuid} for ${assigned_exam.uniqname} (${assigned_exam.student_email})`);
        return res.status(200).json(await db_saveLiveExamSubmission(
          exam_uuid, userInfo.email, req.body.submission
        ));
      },
    ]
  }));