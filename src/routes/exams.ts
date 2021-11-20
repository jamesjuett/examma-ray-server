import { NextFunction, Request, Response, Router } from "express";
import { db_getSubmissionsList } from "../db/db_exams";
import { EXAMMA_RAY_GRADER } from "../server";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateParamExammaRayId } from "./common";
import multer from "multer"
import { Worker } from "worker_threads";

// const upload = multer({
//   storage: multer.diskStorage({
//     destination: (req, file, callback) => {
//       const exam_id = req.params["exam_id"];
//       callback(null, `data/${exam_id}/submissions`);
//     },
    
//     filename: (req, file, callback) => {
//       callback(null, file.originalname);
//     }
//   }),
// });

const upload = multer({
  dest: "uploads/",
  limits: {
    fieldNameSize: 1000,
    fieldSize: 1000000000,
    headerPairs: 100000
  }
});

export const exams_router = Router();
exams_router
  .get("/", createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      res.status(200);
      res.json(EXAMMA_RAY_GRADER.exams.map(exam => {
        const {sections, ...rest} = exam.spec;
        return rest;
      }));
    }
  }));

exams_router
  .get("/:exam_id/submissions-list/", createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_id = req.params["exam_id"];
      res.status(200).json(await db_getSubmissionsList(exam_id));
    }
  }));

  

exams_router
  .post("/:exam_id/submissions/", createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: [
      async (req: Request, res: Response, next: NextFunction) => {
        console.log("test");
        next();
      },
      upload.array("submissions"),
      async (req: Request, res: Response) => {
        const exam_id = req.params["exam_id"];

        console.log(`Beginning to process ${req.files?.length} submissions...`);

        // Files will have been uploaded to "/uploads" and information about
        // each is in the req.files object. We'll pass this off to a worker
        // script to process each
        const worker = new Worker("./build/run/process_submissions.js", {
          workerData: {
            exam_id: exam_id,
            files: req.files
          }
        });

        res.sendStatus(200);
      }
    ]
  }));