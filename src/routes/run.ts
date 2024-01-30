import { Request, Response, Router } from "express";
import { RunGradingRequest } from "../dashboard";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParam, validateParamExamId } from "./common";
import { ServerTasks } from "../ServerTasks";
import { Worker } from "worker_threads";

export const run_router = Router();

run_router.route("/grade/:exam_id").post(createRoute({
  authorization: NO_AUTHORIZATION,
  preprocessing: jsonBodyParser,
  validation: [
    validateParamExamId,
    validateBody("reports").isBoolean({strict: true}),
    validateBody("curve").isBoolean({strict: true}),
    validateBody("target_mean").optional({nullable: true}).isNumeric(),
    validateBody("target_stddev").optional({nullable: true}).isNumeric(),
  ],
  handler: (req: Request, res: Response) => {

    let run_request = <RunGradingRequest>req.body;

    const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
    if (!exam) {
      res.sendStatus(404);
      return;
    }

    if (exam.tasks.taskStatus["grade"]) {
      res.status(200).json("A grading task is already running. Please wait for it to finish.");
      return;
    }

    exam.gradeExams(run_request);
    res.status(200).json(run_request.reports ? "Report generation started..." : "Grading run started...");
  }
}));

run_router.route("/generate/:exam_id").post(createRoute({
  authorization: NO_AUTHORIZATION,
  preprocessing: jsonBodyParser,
  validation: [
    validateParamExamId,
  ],
  handler: (req: Request, res: Response) => {

    const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
    if (!exam) {
      res.sendStatus(404);
      return;
    }

    if (exam.tasks.taskStatus["generate"]) {
      res.status(200).json("A generation task is already running. Please wait for it to finish.");
      return;
    }

    exam.generateExams();
    res.status(200).json("Exam generation started...");
  }
}));

const participation_tasks = new ServerTasks<"generate_csv">();

run_router.route("/participation/").post(createRoute({
  authorization: NO_AUTHORIZATION,
  preprocessing: NO_PREPROCESSING,
  validation: NO_VALIDATION,
  handler: (req: Request, res: Response) => {

    if (participation_tasks.taskStatus["generate_csv"]) {
      res.status(200).json("Participation CSV generation is already running. Please wait for it to finish.");
      return;
    }

    const worker = new Worker("./build/run/participation.js");
    participation_tasks.workerTask(worker, "generate_csv", "Preparing to grade submissions...");
    
    res.status(200).json("Participation CSV generation started...");
  }
}));

