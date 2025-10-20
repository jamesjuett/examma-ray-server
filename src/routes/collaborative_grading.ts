import { Request, Response, Router } from "express";
import { matchedData } from "express-validator";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { CollaborativeGradingServer } from "../collaborative_grading/CollaborativeGradingServer";
import { CollaborativeGraderKind, CollaborativeGradingPingRequest, CollaborativeGradingPingResponse, CollaborativeGradingServerConfig, GradingRecords } from "../collaborative_grading/CollaborativeGradingTypes";
import { ExamInstanceInfo, QuestionSubmissionRecord } from "../rest_types";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser_large_10MB, NO_AUTHORIZATION, NO_PREPROCESSING, validateBody, validateParam } from "./common";

const validateParamGradingServerPK = validateParam("grading_server_pk").isInt({min: 1});

const validateBodyClientUuid = validateBody("client_uuid").isUUID();
const validateBodyClientGradingEpoch = validateBody("client_grading_epoch").isInt({min: 0});
const validateBodyClientState = validateBody("client_state").isObject();
const validateBodyClientOperations = validateBody("client_operations").isArray();




export const collaborative_grading_router = Router();

collaborative_grading_router
  .route("/:grading_server_pk/config")
    .get(createRoute({
      authorization: NO_AUTHORIZATION,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamGradingServerPK,
      ],
      handler: async (req, res: Response<CollaborativeGradingServerConfig>) => {
        const params = matchedData(req, { locations: ["params"] });
        const grading_server_pk = parseInt(params.grading_server_pk);
        console.log("Fetching config for grading server", grading_server_pk);
        const config = await CollaborativeGradingServer.getConfig(grading_server_pk);
        return config ? res.status(200).json(config) : res.sendStatus(404);
      }
    }));

collaborative_grading_router
  .route("/:grading_server_pk/grading_records")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamGradingServerPK,
      ],
      handler: async (req, res: Response<GradingRecords<CollaborativeGraderKind>>) => {
        const grading_server_pk = parseInt(req.params["grading_server_pk"]);
        let grading_server = await CollaborativeGradingServer.getInstance(grading_server_pk);

        if (!grading_server) {
          return res.sendStatus(404);
        }

        return res.status(200).json(grading_server.grading_records);
      }
    }));

collaborative_grading_router
  .route("/:grading_server_pk/exam_instances")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamGradingServerPK,
      ],
      handler: async (req, res: Response<ExamInstanceInfo[]>) => {
        const grading_server_pk = parseInt(req.params["grading_server_pk"]);
        const exam_instance_uuids = await CollaborativeGradingServer.getExamInstanceUuids(grading_server_pk);
        const exam_instance_infos = exam_instance_uuids.map(uuid => EXAMMA_RAY_GRADING_SERVER.examInstancesByUuid.get(uuid)?.getInfo()).filter(info => info !== undefined);
        return res.status(200).json(exam_instance_infos);
      }
    }));

collaborative_grading_router
  .route("/:grading_server_pk/submissions")
    .get(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: NO_PREPROCESSING,
      validation: [
        validateParamGradingServerPK,
      ],
      handler: async (req, res: Response<QuestionSubmissionRecord[]>) => {
        const grading_server_pk = parseInt(req.params["grading_server_pk"]);
        return res.status(200).json(await CollaborativeGradingServer.getSubmissions(grading_server_pk));
      }
    }));

collaborative_grading_router
  .route("/:grading_server_pk/ping")
    .post(createRoute({
      authorization: NO_AUTHORIZATION, // requireSuperUser,
      preprocessing: jsonBodyParser_large_10MB,
      validation: [
        validateBodyClientUuid,
        validateParamGradingServerPK,
        validateBodyClientUuid,
        validateBodyClientGradingEpoch,
        validateBodyClientState,
        validateBodyClientOperations,
      ],
      handler: async (req, res: Response<CollaborativeGradingPingResponse>) => {
        let userInfo = getJwtUserInfo(req);
        const ping_request = matchedData(req, { locations: ["body"] }) as CollaborativeGradingPingRequest;
        const grading_server_pk = parseInt(req.params["grading_server_pk"]);
        let grading_server = await CollaborativeGradingServer.getInstance(grading_server_pk);
        if (!grading_server) {
          return res.sendStatus(404);
        }

        const ping_response = await grading_server.processManualGradingPing(userInfo.email, ping_request);
        return res.status(200).json(ping_response);
      }
    }));