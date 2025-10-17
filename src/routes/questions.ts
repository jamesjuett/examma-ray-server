import { Request, Response, Router } from "express";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, validateParamExammaRayId } from "./common";
import { db_getAllSubmissionsForQuestionEver } from "../db/db_questions";
import { AssignedQuestionSkin, QuestionSubmissionRecord } from "../rest_types";
import { db_getManualGradingQuestionSkins } from "../db/db_rubrics";


export const questions_router = Router();
questions_router
  .route("/:question_id/spec")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("question_id"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {

      // Temporary hack: questions are not currently stored on their own as first-class entities,
      // so we have to search through all exams to find the question with the given ID.
      // Eventually this will change.
      // Also hack: automatically adjust 

      for(const examServer of EXAMMA_RAY_GRADING_SERVER.examServersById.values()) {
        for(const question of examServer.exam.allQuestions) {
          if (question.question_id === req.params["question_id"]) {
            return res.status(200).json(question.spec);
          }
        }
      }

      return res.sendStatus(404);
    }
  }));

questions_router
  .route("/:question_id/submissions")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("question_id"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response<QuestionSubmissionRecord[]>) => {
      return res.status(200).json(await db_getAllSubmissionsForQuestionEver(req.params["question_id"]));
    }
  }));

questions_router
  .route("/:question_id/assigned_skins")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("question_id"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response<AssignedQuestionSkin[]>) => {
      return res.status(200).json(await db_getManualGradingQuestionSkins(req.params["question_id"]));
    }
  }));