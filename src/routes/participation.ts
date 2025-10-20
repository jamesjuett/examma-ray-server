import cors from "cors";
import { NextFunction, Request, Response, Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jsonwebtoken from "jsonwebtoken";
import { auth_config } from "../auth/config";
import { db_setOnlineSubmission } from "../db/db_online_submissions";
import { db_getAllParticipationForUser, db_getParticipation, db_setParticipation } from "../db/db_participation";
import { assert } from "../util/util";
import { createRoute, jsonBodyParser_large_10MB, NO_AUTHORIZATION, NO_VALIDATION, validateBody, validateParamExammaRayId } from "./common";

const client = new OAuth2Client();

export const participation_router = Router();

interface ParticipationRequest extends Request {
  participation_email?: string;
}

async function PARTICIPATION_AUTH(req: Request, res: Response, next: NextFunction) {
  const token = req.header("Authorization")
  if (!token || token === "") {
    return res.sendStatus(404);
  }

  try {
    const decoded = jsonwebtoken.verify(token, auth_config.participation.jwt_secret);
    const email = decoded.sub;
    if (!email || email === "" || typeof email !== "string") {
      return res.sendStatus(403);
    }

    (<ParticipationRequest>req).participation_email = email;
    next();
  }
  catch (err) {
    return res.sendStatus(403);
  }
}


participation_router.route("/auth")
  .options(cors())
  .post(createRoute({
    preprocessing: cors(),
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: [
      async (req: ParticipationRequest, res: Response) => {
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
          return res.sendStatus(403);
        }
        
        const email = payload['email'];
        if (!email) {
          return res.sendStatus(403);
        }

        res.status(201).json({
          participation_token: jsonwebtoken.sign(
            {}, // empty payload
            auth_config.participation.jwt_secret,
            {
              // No expiration
              subject: email
            }
          )
        });
      }
    ]
  }));

participation_router.route("/me")
  .options(cors())
  .get(createRoute({
    preprocessing: cors(),
    validation: NO_VALIDATION,
    authorization: PARTICIPATION_AUTH,
    handler: [
      async (req: ParticipationRequest, res: Response) => {
        const email = req.participation_email;

        if (!email) {
          return res.sendStatus(404);
        }

        const result = await db_getAllParticipationForUser(email);
        res.status(200).json(result);
      }
    ]
  }));

participation_router.route("/me/:exam_id")
  .options(cors())
  .get(createRoute({
    preprocessing: cors(),
    validation: [
      validateParamExammaRayId("exam_id"),
    ],
    authorization: PARTICIPATION_AUTH,
    handler: [
      cors(),
      async (req: ParticipationRequest, res: Response) => {

        const exam_id = req.params["exam_id"];
        const email = req.participation_email;
        assert(email);

        const result = await db_getParticipation(exam_id, email);
        
        if (result) {
          res.status(200).json({
            ...result,
            is_complete: true,
          });
        }
        else {
          res.status(200).json({
            exam_id: exam_id,
            email: email,
            is_complete: false,
          })
        }
      }
    ]
  }))
  .put(createRoute({
    preprocessing: cors(),
    validation: [
      validateParamExammaRayId("exam_id"),
    ],
    authorization: PARTICIPATION_AUTH,
    handler: [
      cors(),
      async (req: ParticipationRequest, res: Response) => {

        const exam_id = req.params["exam_id"];
        const email = req.participation_email;
        assert(email);

        const result = await db_setParticipation(exam_id, email);
        
        if (result) {
          res.status(201).json({
            ...result,
            is_complete: true,
          });
        }
        else {
          return res.sendStatus(500);
        }
      }
    ]
  }));

  participation_router.route("/me/:exam_id/submission")
  .options(cors())
  .put(createRoute({
    preprocessing: [
      cors(),
      jsonBodyParser_large_10MB,
    ],
    validation: [
      validateParamExammaRayId("exam_id"),
      validateBody("submission").isString().trim().isLength({min: 1, max: 1000000}),
    ],
    authorization: PARTICIPATION_AUTH,
    handler: [
      cors(),
      async (req: ParticipationRequest, res: Response) => {

        const exam_id = req.params["exam_id"];
        const submission = req.body["submission"];
        const email = req.participation_email;
        assert(email);

        const result = await db_setOnlineSubmission(exam_id, email, submission);
        
        if (result) {
          res.status(201).json({
            ...result,
            is_complete: true,
          });
        }
        else {
          return res.sendStatus(500);
        }
      }
    ]
  }));