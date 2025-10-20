import express, { Request, Response, Router } from "express";
import { db_getLiveExamAssignmentByExamUuid, db_getLiveExamAssignmentsByUniqname, db_getExamInstanceByUuid, db_getLiveExamSubmissionByUuid, db_getWindowByUuid, db_setStartTimeToNow } from "../db/db_live";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, validateParamExammaRayId, validateParamUuid } from "./common";
import { getJwtUserInfo, isSuper } from "../auth/jwt_auth";
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

      const exam_info = await db_getLiveExamAssignmentByExamUuid(exam_uuid);

      // Does the requested exam even exist?
      if (!exam_info) {
        console.log(`Live exam ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

      // If it exists, is the user authorized to access it?
      if (exam_info.student_email !== userInfo.email && !isSuper(userInfo.email)) {
        console.log(`Live exam FORBIDDEN: ${userInfo.email} not authorized to access exam ${exam_uuid} for ${exam_info.uniqname} (${exam_info.student_email})`);
        return res.sendStatus(404); // 404 and not 403 - don't reveal existence
      }

      const exam_instance = await db_getExamInstanceByUuid(exam_info.exam_instance_uuid);
      if (!exam_instance) {
        console.log(`Live exam ERROR: No such exam instance ${exam_info.exam_instance_uuid} for exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

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
        if (now.getTime() < new Date(window.open_time).getTime() || now.getTime() >= new Date(window.close_time).getTime()) {
          console.log(`Live exam FORBIDDEN: ${userInfo.email} attempted to access exam ${exam_uuid} outside of window ${window.name} (${window.open_time} - ${window.close_time})`);
          return res.sendStatus(403);
        }

        // If the exam has a duration, are we within that time limit?
        const duration_ms = exam_instance.duration_seconds * exam_info.duration_multiplier * 1000;
        if (exam_info.start_time && exam_info.start_time.getTime() + duration_ms < now.getTime()) {
          console.log(`Live exam FORBIDDEN: ${userInfo.email} attempted to access exam ${exam_uuid} after time limit expired`);
          return res.sendStatus(403);
        }
      }

      console.log(`Live exam ACCESSED: ${userInfo.email} accessed exam ${exam_uuid} for ${exam_info.uniqname} (${exam_info.student_email})`);
      
      // start the exam in the database if not already started
      if (!exam_info.start_time) {
        await db_setStartTimeToNow(exam_uuid);
      }

      return res.sendFile(`${exam_instance.exam_id}/exams/${exam_info.uniqname}-${exam_info.exam_uuid}.html`, { root: "live" });
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

      const exam_info = await db_getLiveExamAssignmentByExamUuid(exam_uuid);

      // Does the requested exam even exist?
      if (!exam_info) {
        console.log(`Graded exam ERROR: No such exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

      // If it exists, is the user authorized to access it?
      if (exam_info.student_email !== userInfo.email) {
        console.log(`Graded exam FORBIDDEN: ${userInfo.email} not authorized to access exam ${exam_uuid} for ${exam_info.uniqname} (${exam_info.student_email})`);
        return res.sendStatus(404); // 404 and not 403 - don't reveal existence
      }

      const exam_instance = await db_getExamInstanceByUuid(exam_info.exam_instance_uuid);
      if (!exam_instance) {
        console.log(`Graded exam ERROR: No such exam instance ${exam_info.exam_instance_uuid} for exam ${exam_uuid} attempted by ${userInfo.email}`);
        return res.sendStatus(404);
      }

      return res.sendFile(`${exam_instance.exam_id}/graded/${exam_info.uniqname}-${exam_info.exam_uuid}.html`, { root: "live" });
    },
  }));