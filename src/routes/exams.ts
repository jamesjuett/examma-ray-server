import { ExamSpecification } from "examma-ray";
import { NextFunction, Request, Response, Router } from "express";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import multer from "multer";
import { Worker } from "worker_threads";
import { db_createExam, db_getExamEpoch, db_getSubmissionsList } from "../db/db_exams";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateParamExammaRayId } from "./common";

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
  dest: "uploads/"
});

export const exams_router = Router();
exams_router
  .route("/")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      res.status(200);
      res.json(EXAMMA_RAY_GRADING_SERVER.exams.map(exam => {
        const {sections, ...rest} = exam.exam.spec;
        return rest;
      }));
    }
  }))
  .post(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: [
      upload.single("exam_spec"),
      async (req: Request, res: Response) => {

        if (!req.file) {
          return res.sendStatus(400);
        }

        const uploaded_filepath = `uploads/${req.file?.filename}`;
        const new_exam_spec = <ExamSpecification>JSON.parse(await readFile(uploaded_filepath, "utf8"));
        await rm(uploaded_filepath, { force: true });

        if (EXAMMA_RAY_GRADING_SERVER.exams_by_id[new_exam_spec.exam_id]) {
          return res.sendStatus(403);
        }
        
        const exam_id = new_exam_spec.exam_id;

        await mkdir(`data/${exam_id}/`);
        await mkdir(`data/${exam_id}/manifests`);
        await mkdir(`data/${exam_id}/submissions`);
        await mkdir(`data/${exam_id}/error-submissions`);
  
        await writeFile(`data/${exam_id}/exam-spec.json`, JSON.stringify(new_exam_spec, null, 2), "utf8");
        await writeFile(`data/${exam_id}/roster.csv`, "uniqname,name", "utf8");
  
        await db_createExam(new_exam_spec);

        EXAMMA_RAY_GRADING_SERVER.loadExam(new_exam_spec);
  
        return res.sendStatus(201);
      }
    ]
  }));

exams_router
  .route("/:exam_id")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];
      if (!exam) {
        res.sendStatus(404);
        return;
      }
      res.status(200).json(exam.exam.spec);
    }
  }));



exams_router
  .route("/:exam_id/questions/:question_id")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamExammaRayId("question_id"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const question_spec = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]]?.exam.allQuestions.find(q => q.question_id === req.params["question_id"]);
      return question_spec ? res.status(200).json(question_spec) : res.sendStatus(404);
    }
  }));



exams_router
  .route("/:exam_id/submissions")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_id = req.params["exam_id"];
      res.status(200).json(await db_getSubmissionsList(exam_id));
    }
  }))
  .post(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: [
      upload.array("submissions"),
      async (req: Request, res: Response) => {
        const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];
        if (!exam) {
          res.sendStatus(404);
          return;
        }

        req.files && exam.addSubmissions(<Express.Multer.File[]>req.files);

        res.sendStatus(200);
      }
    ]
  }));

exams_router
  .route("/:exam_id/roster")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];

      if (!exam) {
        return res.sendStatus(404);
      }

      res.status(200).json(await exam.getRoster());
    }
  }))
  .put(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: [
      upload.single("roster"),
      async (req: Request, res: Response) => {
        const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];

        if (!exam) {
          return res.sendStatus(404);
        }

        if (!req.file) {
          return res.sendStatus(400);
        }

        const uploaded_filepath = `uploads/${req.file?.filename}`;

        await exam.update({ new_roster_csv_filepath: uploaded_filepath });

        await rm(uploaded_filepath, { force: true });
        return res.sendStatus(201);
      }
    ]
  }));

  

exams_router
  .route("/:exam_id/secret")
  .put(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: [
      upload.single("secret"),
      async (req: Request, res: Response) => {
        const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];

        if (!exam) {
          return res.sendStatus(404);
        }

        if (!req.file) {
          return res.sendStatus(400);
        }

        const uploaded_filepath = `uploads/${req.file?.filename}`;

        await exam.update({ new_secret_filepath: uploaded_filepath});

        await rm(uploaded_filepath, { force: true });
        return res.sendStatus(201);
      }
    ]
  }));

exams_router
  .route("/:exam_id/epoch")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      res.status(200).json(await db_getExamEpoch(req.params["exam_id"]));
    }
  }));



exams_router
  .route("/:exam_id/ping")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      
      const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];
      if (exam) {
        res.status(200).json({
          epoch: exam.epoch,
          active_graders: exam.getActiveGraders()
        });
      }
      else {
        res.sendStatus(404);
      }
    }
  }));

  

exams_router
  .route("/:exam_id/tasks")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];

      if (!exam) {
        return res.sendStatus(404);
      }

      res.status(200).json(exam.getTaskStatus());
    }
  }));



exams_router
  .route("/:exam_id/active_graders")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam = EXAMMA_RAY_GRADING_SERVER.exams_by_id[req.params["exam_id"]];
      if (!exam) {
        res.sendStatus(404);
        return;
      }
      res.status(200).json(exam.getActiveGraders());
    }
  }));