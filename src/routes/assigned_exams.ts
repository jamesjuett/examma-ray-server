import { Request, Response, Router } from "express";
import { db_getLiveExamAssignmentByExamUuid, db_getLiveExamInstanceByUuid, db_getLiveExamSubmissionByUuid } from "../db/db_live";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, validateBody, validateParamUuid } from "./common";


export const assigned_exams = Router();

// assigned_exams.route("/:exam_uuid/uniqnames/:uniqname")
//   .get(createRoute({
//     preprocessing: NO_PREPROCESSING,
//     validation: [
//       validateParamUuid("exam_uuid"),
//       validateParamExammaRayId("uniqname"),
//     ],
//     authorization: NO_AUTHORIZATION,
    
//     handler: async (req: Request, res: Response) => {
//       return res.status(200).json(await db_getLiveExamAssignmentsByUniqname(req.params["uniqname"]));
//     },
//   }));

assigned_exams.route("/:exam_uuid")
  .put(createRoute({
    preprocessing: jsonBodyParser,
    validation: [
      validateParamUuid("exam_uuid"),
      validateBody("exam_id").isLength({min: 1, max: 100}),
      validateBody("exam_instance_uuid").isUUID(),
      validateBody("name").isLength({min: 1, max: 200}).optional(),
      validateBody("exam_window").isUUID().optional(),
      validateBody("duration_multiplier").isFloat({min: 0}).optional(),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const exam_uuid = req.params["exam_uuid"];
      const exam_window : string | undefined = req.body.exam_window;

      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.body["exam_id"])
        ?.getExamInstanceByUuid(req.body["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.status(400).send("Invalid exam_id or exam_instance_uuid");
      }

      return res.status(200).json(exam_inst.updateAssignedExamByUuid(exam_uuid, {
        name: req.body.name,
        window_uuid: exam_window,
        duration_multiplier: req.body.duration_multiplier,
      }));
      
    },
  }));

assigned_exams.route("/:exam_uuid/reset_time")
  .post(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamUuid("exam_uuid"),
      validateBody("exam_id").isLength({min: 1, max: 100}),
      validateBody("exam_instance_uuid").isUUID(),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const exam_uuid = req.params["exam_uuid"];
      const exam_window : string | undefined = req.body.exam_window;

      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.body["exam_id"])
        ?.getExamInstanceByUuid(req.body["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.status(400).send("Invalid exam_id or exam_instance_uuid");
      }

      return res.status(200).json(exam_inst.resetAssignedExamTimerByExamUuid(exam_uuid));
    },
  }));

assigned_exams.route("/:exam_uuid/force_open")
  .put(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamUuid("exam_uuid"),
      validateBody("exam_id").isLength({min: 1, max: 100}),
      validateBody("exam_instance_uuid").isUUID(),
      validateBody("force_open").isBoolean(),
    ],
    authorization: NO_AUTHORIZATION,
    
    handler: async (req: Request, res: Response) => {
      const exam_uuid = req.params["exam_uuid"];
      const exam_window : string | undefined = req.body.exam_window;

      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.body["exam_id"])
        ?.getExamInstanceByUuid(req.body["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.status(400).send("Invalid exam_id or exam_instance_uuid");
      }

      return res.status(200).json(exam_inst.setForceOpenByExamUuid(exam_uuid, req.body.force_open));
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