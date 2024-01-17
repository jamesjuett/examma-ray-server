import { ExamSpecification, parseExamSpecification, stringifyExamComponentSpecification } from "examma-ray";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { Request, Response, Router } from "express";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import multer from "multer";
import { requireAdmin } from "../auth/jwt_auth";
import { db_getExam, db_getExamEpoch, db_getExams, db_getExamSubmissions } from "../db/db_exams";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParam, validateParamExammaRayId, validateParamUuid } from "./common";
import { OAuth2Client } from "google-auth-library";
import { auth_config } from "../auth/config";
import { db_getParticipation, db_setParticipation } from "../db/db_participation";

const client = new OAuth2Client();

export const participation_router = Router();

participation_router
  .route("/me/:exam_id")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {

      const exam_id = req.params["exam_id"];
      
      const token = req.header("Authorization")
      if (!token || token === "") {
        return res.sendStatus(404);
      }

      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: auth_config.participation.clientID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return res.sendStatus(404);
      }
      
      const email = payload['email'];
      if (!email) {
        return res.sendStatus(404);
      }

      const result = await db_getParticipation(exam_id, email);
      
      if (result) {
        res.status(200).json(result);
      }
      else {
        return res.sendStatus(404);
      }
    }
  }))
  .post(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: [
      async (req: Request, res: Response) => {

        const exam_id = req.params["exam_id"];

        const token = req.header("Authorization")
        if (!token || token === "") {
          return res.sendStatus(404);
        }

        const ticket = await client.verifyIdToken({
          idToken: token,
          audience: auth_config.participation.clientID,
        });

        const payload = ticket.getPayload();
        if (!payload) {
          return res.sendStatus(404);
        }
        
        const email = payload['email'];
        if (!email) {
          return res.sendStatus(404);
        }

        const result = await db_setParticipation(exam_id, email);
        
        if (result) {
          res.status(201).json(result);
        }
        else {
          return res.sendStatus(404);
        }
      }
    ]
  }));
