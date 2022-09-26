import { ExamSpecification, parseExamSpecification, stringifyExamComponentSpecification } from "examma-ray";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { Request, Response, Router } from "express";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import multer from "multer";
import { db_getExam, db_getExamEpoch, db_getExams, db_getExamSubmissions } from "../db/db_exams";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParamExammaRayId, validateParamUuid } from "./common";

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
      return res.status(200).json(await db_getExams());
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
        const new_exam_spec = parseExamSpecification(await readFile(uploaded_filepath, "utf8"));
        await rm(uploaded_filepath, { force: true });

        if (EXAMMA_RAY_GRADING_SERVER.getExamServer(new_exam_spec.exam_id)) {
          // just update file
          await writeFile(`data/${new_exam_spec.exam_id}/exam-spec.json`, stringifyExamComponentSpecification(new_exam_spec), "utf8");
          return res.sendStatus(201);
        }
        
        const exam_id = new_exam_spec.exam_id;

        await mkdir(`data/${exam_id}/`);
        await mkdir(`data/${exam_id}/manifests`);
        await mkdir(`data/${exam_id}/submissions`);
        await mkdir(`data/${exam_id}/error-submissions`);
  
        await writeFile(`data/${exam_id}/exam-spec.json`, stringifyExamComponentSpecification(new_exam_spec), "utf8");
        await writeFile(`data/${exam_id}/roster.csv`, "uniqname,name", "utf8");

        EXAMMA_RAY_GRADING_SERVER.loadExamServer(new_exam_spec);
  
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
      
      const exam_server = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);

      if (!exam_server) {
        return res.sendStatus(404);
      }

      return res.status(200).json(exam_server.getExamInfo());
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

        // Unload the exam server, which means we immediately cease to process
        // any exam-level requests (that would go to the to-be-deleted exam)
        const exam_server = EXAMMA_RAY_GRADING_SERVER.unloadExamServer(exam_id);
        
        // There wasn't any server for that exam
        if (!exam_server) {
          return res.sendStatus(404);
        }

        // Remove all manual grading, exam submissions, and exam info from the DB
        await exam_server.deleteEverything();
        
        return res.sendStatus(204); // 204 No Content (delete was successful)
      }
    ]
  }));

exams_router
  .route("/:exam_id/spec")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_server = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
      if (!exam_server) {
        res.sendStatus(404);
        return;
      }
      res.status(200).json(exam_server.exam.spec);
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

        await exam.setRoster(uploaded_filepath);

        await rm(uploaded_filepath, { force: true });
        return res.sendStatus(201);
      }
    ]
  }));

  

exams_router
  .route("/:exam_id/uuidv5_namespace")
  .put(createRoute({
    preprocessing: jsonBodyParser,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateBody("uuidv5_namespace").isUUID(),
    ],
    authorization: NO_AUTHORIZATION,
    handler: [
      async (req: Request, res: Response) => {
        const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);

        if (!exam) {
          return res.sendStatus(404);
        }

        await exam.setUuidV5Namespace(req.body.uuidv5_namespace);

        // We don't await this, let it run async
        exam.generateExams();

        return res.sendStatus(204);
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