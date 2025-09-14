import { Request, Response, Router } from "express";
import { db_getLiveExamAssignmentByExamUuid, db_getLiveExamAssignmentsByUniqname, db_getLiveExamInstanceByUuid, db_getLiveExamSubmissionByUuid } from "../db/db_live";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, validateParamExammaRayId, validateParamUuid } from "./common";


export const assigned_exams = Router();

assigned_exams.route("/:exam_uuid/uniqnames/:uniqname")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamUuid("exam_uuid"),
      validateParamExammaRayId("uniqname"),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      return res.status(200).json(await db_getLiveExamAssignmentsByUniqname(req.params["uniqname"]));
    },
  }));

assigned_exams.route("/:exam_uuid/manifest")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamUuid("exam_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      
      const exam_assn = await db_getLiveExamAssignmentByExamUuid(req.params["exam_uuid"]);
      if (!exam_assn) {
        return res.sendStatus(404);
      }

      const exam_instance = await db_getLiveExamInstanceByUuid(exam_assn.exam_instance_uuid);
      if (!exam_instance) {
        return res.sendStatus(404);
      }

      return res.sendFile(`${exam_instance.exam_id}/manifests/${exam_assn.uniqname}-${exam_assn.exam_uuid}.json`, { root: "data" });
    },
  }));

assigned_exams.route("/:exam_uuid/submission")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamUuid("exam_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      
      const submission = await db_getLiveExamSubmissionByUuid(req.params["exam_uuid"]);
      if (!submission) {
        return res.sendStatus(404);
      }

      return res.status(200).json(submission);
    },
  }));