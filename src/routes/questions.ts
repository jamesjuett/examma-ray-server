import { Request, Response, Router } from "express";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, validateParamQuestionId } from "./common";

export const questions_router = Router();
questions_router
  .get("/:question_id", createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamQuestionId
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      res.status(200);
      res.json(EXAMMA_RAY_GRADING_SERVER.getAllExams()
          .flatMap(exam => exam.exam.allQuestions)
          .find(q => q.question_id === req.params["question_id"])?.spec);
    }
  }));