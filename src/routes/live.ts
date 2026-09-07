import express, { Request, Response, Router } from "express";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, validateParamExammaRayId, validateParamUuid } from "./common";
import { getJwtUserInfo, isSuper } from "../auth/jwt_auth";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { isDurationExpired, isWithinWindow } from "../util/util";
import e from "express";


export const live_exams_router = Router();

live_exams_router.route("/:exam_id/exams/:exam_uuid.html")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      const exam_uuid = req.params["exam_uuid"];

      const found = EXAMMA_RAY_GRADING_SERVER.getAssignedExamByUuid(exam_uuid);

      // Does the requested exam even exist?
      if (!found) {
        console.log(`Live exam ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }
      const { exam_instance, assigned_exam } = found;

      // If it exists, is the user authorized to access it?
      if (assigned_exam.student_email !== userInfo.email && !isSuper(userInfo.email)) {
        console.log(`Live exam FORBIDDEN: ${userInfo.email} not authorized to access exam ${exam_uuid} for ${assigned_exam.uniqname} (${assigned_exam.student_email})`);
        return res.sendStatus(404); // 404 and not 403 - don't reveal existence
      }

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
        if (!isWithinWindow(window.open_time, window.close_time, now_ms)) {
          console.log(`Live exam FORBIDDEN: ${userInfo.email} attempted to access exam ${exam_uuid} outside of window ${window.name} (${window.open_time} - ${window.close_time})`);
          return res.sendStatus(403);
        }

        // If the exam has a duration, are we within that time limit?
        if (isDurationExpired(exam_instance.duration_seconds, assigned_exam.duration_multiplier, assigned_exam.start_time, now_ms)) {
          console.log(`Live exam FORBIDDEN: ${userInfo.email} attempted to access exam ${exam_uuid} after time limit expired`);
          return res.sendStatus(403);
        }
      }

      console.log(`Live exam ACCESSED: ${userInfo.email} accessed exam ${exam_uuid} for ${assigned_exam.uniqname} (${assigned_exam.student_email})`);
      
      // start the exam if not already started
      await exam_instance.startAssignedExamByUuid(exam_uuid);

      return res.sendFile(`${exam_instance.exam_id}/exams/${assigned_exam.uniqname}-${assigned_exam.exam_uuid}.html`, { root: "live" });
    },
  }));


live_exams_router.route("/:exam_id/graded/:exam_uuid.html")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      const exam_uuid = req.params["exam_uuid"];

      const found = EXAMMA_RAY_GRADING_SERVER.getAssignedExamByUuid(exam_uuid);

      // Does the requested exam even exist?
      if (!found) {
        console.log(`Graded exam ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }
      const { exam_instance, assigned_exam } = found;

      // If it exists, is the user authorized to access it?
      if (assigned_exam.student_email !== userInfo.email) {
        console.log(`Graded exam FORBIDDEN: ${userInfo.email} not authorized to access exam ${exam_uuid} for ${assigned_exam.uniqname} (${assigned_exam.student_email})`);
        return res.sendStatus(404); // 404 and not 403 - don't reveal existence
      }

      return res.sendFile(`${exam_instance.exam_id}/graded/${assigned_exam.uniqname}-${assigned_exam.exam_uuid}.html`, { root: "live" });
    },
  }));