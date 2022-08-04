import { ExamSpecification } from "examma-ray";
import { NextFunction, Request, Response, Router } from "express";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import multer from "multer";
import { Worker } from "worker_threads";
import { db_deleteManualGradingByExam } from "../db/db_code_grader";
import { db_createExam, db_deleteExam, db_deleteExamSubmissionByUuid, db_deleteExamSubmissions, db_getExamEpoch, db_getExamSubmissions } from "../db/db_exams";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateParamExammaRayId, validateParamUuid } from "./common";

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
      res.json(EXAMMA_RAY_GRADING_SERVER.getAllExams().map(exam => {
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

        if (EXAMMA_RAY_GRADING_SERVER.getExamServer(new_exam_spec.exam_id)) {
          // just update file
          await writeFile(`data/${new_exam_spec.exam_id}/exam-spec.json`, JSON.stringify(new_exam_spec, null, 2), "utf8");
          return res.sendStatus(201);
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
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
      if (!exam) {
        res.sendStatus(404);
        return;
      }
      res.status(200).json(exam.exam.spec);
    }
  }))
  .delete(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: [
      async (req: Request, res: Response) => {

        const exam_id = req.params["exam_id"];
        const exam_server = EXAMMA_RAY_GRADING_SERVER.getExamServer(exam_id);
        
        if (!exam_server) {
          return res.sendStatus(404);
        }

        // Stop the exam server, which means we immediately cease to process
        // any exam-level requests (that would go to the to-be-deleted exam)
        EXAMMA_RAY_GRADING_SERVER.unloadExamServer(exam_id);

        // Remove all manual grading, exam submissions, and exam info from the DB
        await db_deleteManualGradingByExam(exam_id);
        await db_deleteExamSubmissions(exam_id);
        await db_deleteExam(exam_id);

        // Remove the exam data directory
        await rm(`data/${exam_id}/`, { force: true, recursive: true });
        
        return res.sendStatus(204); // 204 No Content (delete was successful)
      }
    ]
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
      const question = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])?.exam.allQuestions.find(q => q.question_id === req.params["question_id"]);
      return question ? res.status(200).json(question.spec) : res.sendStatus(404);
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
      res.status(200).json(await db_getExamSubmissions(exam_id));
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
        const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
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
  .route("/:exam_id/submissions/:submission_uuid")
  .delete(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("submission_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
      if (!exam) {
        res.sendStatus(404);
        return;
      }

      await exam.deleteSubmissionByUuid(req.params["submission_uuid"]);

      res.sendStatus(204);
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
        const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
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
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);

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
        const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);

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
        const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);

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
      
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
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
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);

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
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
      if (!exam) {
        res.sendStatus(404);
        return;
      }
      res.status(200).json(exam.getActiveGraders());
    }
  }));