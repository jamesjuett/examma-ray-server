import { Request, Response, Router } from "express";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { db_getCodeGraderConfig } from "../db/db_code_grader";
import { ManualCodeGraderConfiguration, ManualGradingPingRequest, NextUngradedRequest, NextUngradedResponse } from "../manual_grading";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser_large_10MB, NO_AUTHORIZATION, NO_PREPROCESSING, validateBody, validateParam, validateParamExammaRayId } from "./common";
const validateParamQuestionId = validateParam("question_id").trim().isLength({min: 1, max: 100});
const validateBodyQuestionId = validateBody("question_id").trim().isLength({min: 1, max: 100});
const validateBodyGroupId = validateBody("group_id").trim().isLength({min: 1, max: 100});
const validateBodyClientUuid = validateBody("client_uuid").isUUID();



export const manual_grading_router = Router();

manual_grading_router
  .route("/:exam_id/questions/:question_id/rubric")
    .get(createRoute({
      authorization: NO_AUTHORIZATION,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamQuestionId
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["question_id"]);
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
      authorization: NO_AUTHORIZATION,
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
      authorization: NO_AUTHORIZATION,
      preprocessing: jsonBodyParser_large_10MB,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
        validateBodyGroupId.optional(),
        validateBodyClientUuid,
        validateBody("my_grading_epoch").isInt().optional()
      ],
      handler: async (req: Request, res: Response) => {
        let userInfo = getJwtUserInfo(req);
        let pr = <ManualGradingPingRequest>req.body;
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["question_id"]);
        if (qs) {
          return res.status(200).json(await qs.processManualGradingPing(userInfo.email, pr));
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));

manual_grading_router
  .route("/:exam_id/questions/:question_id/claim_next_ungraded")
    .post(createRoute({
      authorization: NO_AUTHORIZATION,
      preprocessing: jsonBodyParser_large_10MB,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
        validateBodyClientUuid,
      ],
      handler: async (req: Request, res: Response) => {
        let userInfo = getJwtUserInfo(req);
        let next_ungraded_request = <NextUngradedRequest>req.body;
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["question_id"]);
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
  .route("/:exam_id/questions/:question_id/records")
    .get(createRoute({
      authorization: NO_AUTHORIZATION,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["question_id"]);
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
      authorization: NO_AUTHORIZATION,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["question_id"]);
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
      authorization: NO_AUTHORIZATION,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamExammaRayId("exam_id"),
        validateParamExammaRayId("question_id"),
      ],
      handler: async (req: Request, res: Response) => {
        let qs = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.getGradingServer(req.params["question_id"]);
        if (qs) {
          return res.status(200).json(qs.config);
        }
        else {
          return res.sendStatus(404);
        }
      }
    }));