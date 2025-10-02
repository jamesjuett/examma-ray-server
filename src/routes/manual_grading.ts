import { Request, Response, Router } from "express";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { db_getCodeGraderConfig } from "../db/db_code_grader";
import { ManualCodeGraderConfiguration, ManualGradingPingRequest, NextUngradedRequest, NextUngradedResponse } from "../manual_grading";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, validateBody, validateParamExammaRayId } from "./common";



export const manual_grading_router = Router();


manual_grading_router
  .route("/:exam_id/questions/:manual_grader_uuid/rubric")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("manual_grader_uuid"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["manual_grader_uuid"]);
        if (qs) {
          return res.status(200).json(qs.rubric);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));
    
manual_grading_router
  .route("/:manual_grader_uuid/config")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("manual_grader_uuid"),
      ],
      handler: async (req: Request, res: Response) => {
        const result: ManualCodeGraderConfiguration | undefined = await db_getCodeGraderConfig(req.params["manual_grader_uuid"])
        if (result) {
          return res.status(200).json(result);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));

manual_grading_router
  .route("/:exam_id/questions/:manual_grader_uuid/ping")
    .post(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: jsonBodyParser,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("manual_grader_uuid"),
        validateBody("group_uuid").isUUID().optional(),
        validateBody("client_uuid").isUUID(),
        validateBody("my_grading_epoch").isInt().optional()
      ],
      handler: async (req: Request, res: Response) => {
        let userInfo = getJwtUserInfo(req);
        let pr = <ManualGradingPingRequest>req.body;
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["manual_grader_uuid"]);
        if (qs) {
          return res.status(200).json(await qs.processManualGradingPing(userInfo.email, pr));
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));

manual_grading_router
  .route("/:exam_id/questions/:manual_grader_uuid/claim_next_ungraded")
    .post(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: jsonBodyParser,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("manual_grader_uuid"),
        validateBody("client_uuid").isUUID(),
      ],
      handler: async (req: Request, res: Response) => {
        let userInfo = getJwtUserInfo(req);
        let next_ungraded_request = <NextUngradedRequest>req.body;
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["manual_grader_uuid"]);
        if (qs) {
          return res.status(200).json(<NextUngradedResponse>{
            group_uuid: qs.claimNextUngradedGroup(userInfo.email, next_ungraded_request.client_uuid, next_ungraded_request.desired)
          });
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));

manual_grading_router
  .route("/:exam_id/questions/:manual_grader_uuid/records")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("manual_grader_uuid"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["manual_grader_uuid"]);
        if (qs) {
          return res.status(200).json(qs.grading_record);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));


manual_grading_router
  .route("/:exam_id/questions/:manual_grader_uuid/skins")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("manual_grader_uuid"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["manual_grader_uuid"]);
        if (qs) {
          return res.status(200).json(qs.skins);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));


manual_grading_router
  .route("/:exam_id/questions/:manual_grader_uuid/config")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("manual_grader_uuid"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["manual_grader_uuid"]);
        if (qs) {
          return res.status(200).json(qs.config);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));