import { parseExamSpecification, stringifyExamComponentSpecification } from "examma-ray";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { Request, Response, Router } from "express";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import multer from "multer";
import { requireAdmin } from "../auth/jwt_auth";
import { db_getExams, db_getExamSubmissions, db_getOrCreateExam } from "../db/db_exams";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateBody, validateParamExammaRayId, validateParamUuid } from "./common";
import { db_getLiveExamInstancesByExamId } from "../db/db_live";
import { readFileSync } from "fs";
import { WindowInfo } from "../rest_types";
import Papa from "papaparse";
import { assert, assertExists } from "../util/util";

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
      return res.status(200).json(EXAMMA_RAY_GRADING_SERVER.getAllExamsInfo());
    }
  }))
  .post(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: requireAdmin,
    handler: [
      upload.single("exam_spec"),
      async (req: Request, res: Response) => {

        if (!req.file) {
          return res.sendStatus(400);
        }

        const uploaded_filepath = `uploads/${req.file?.filename}`;
        const new_exam_spec = parseExamSpecification(await readFile(uploaded_filepath, "utf8"));
        await rm(uploaded_filepath, { force: true });

        const existing_exam_server = EXAMMA_RAY_GRADING_SERVER.getExamServer(new_exam_spec.exam_id);
        if (existing_exam_server) {
          await writeFile(`data/${new_exam_spec.exam_id}/exam-spec.json`, stringifyExamComponentSpecification(new_exam_spec), "utf8");
          await existing_exam_server.updateSpec(new_exam_spec)
          return res.sendStatus(201);
        }
        
        const exam_id = new_exam_spec.exam_id;

        await mkdir(`data/${exam_id}/`);
        await mkdir(`data/${exam_id}/manifests`);
        await mkdir(`data/${exam_id}/submissions`);
        await mkdir(`data/${exam_id}/error-submissions`);
  
        await writeFile(`data/${exam_id}/exam-spec.json`, stringifyExamComponentSpecification(new_exam_spec), "utf8");
        await writeFile(`data/${exam_id}/roster.csv`, "uniqname,name", "utf8");

        await db_getOrCreateExam(exam_id);

        await EXAMMA_RAY_GRADING_SERVER.loadExamServer(new_exam_spec);

        await EXAMMA_RAY_GRADING_SERVER.getExamServer(exam_id)!.createExamInstance(
          "EECS 280 Fall 2025 Quiz 2",
          1500
        );
  
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

      return res.status(200).json(exam_server.getInfo());
    }
  }))
  // .delete(createRoute({
  //   preprocessing: NO_PREPROCESSING,
  //   validation: [
  //     validateParamExammaRayId("exam_id")
  //   ],
  //   authorization: requireAdmin,
  //   handler: [
  //     async (req: Request, res: Response) => {

  //       const exam_id = req.params["exam_id"];

  //       // Unload the exam server, which means we immediately cease to process
  //       // any exam-level requests (that would go to the to-be-deleted exam)
  //       const exam_server = EXAMMA_RAY_GRADING_SERVER.unloadExamServer(exam_id);
        
  //       // There wasn't any server for that exam
  //       if (!exam_server) {
  //         return res.sendStatus(404);
  //       }

  //       // Remove all manual grading, exam submissions, and exam info from the DB
  //       await exam_server.deleteEverything();
        
  //       return res.sendStatus(204); // 204 No Content (delete was successful)
  //     }
  //   ]
  // }));

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
      res.status(200).send(stringifyExamComponentSpecification(exam_server.exam.spec));
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



// exams_router
//   .route("/:exam_id/submissions")
//   .get(createRoute({
//     preprocessing: NO_PREPROCESSING,
//     validation: [
//       validateParamExammaRayId("exam_id")
//     ],
//     authorization: NO_AUTHORIZATION,
//     handler: async (req: Request, res: Response) => {
//       const exam_id = req.params["exam_id"];
//       res.status(200).json(await db_getExamSubmissions(exam_id));
//     }
//   }))
//   .post(createRoute({
//     preprocessing: NO_PREPROCESSING,
//     validation: [
//       validateParamExammaRayId("exam_id")
//     ],
//     authorization: requireAdmin,
//     handler: [
//       upload.array("submissions"),
//       async (req: Request, res: Response) => {
//         const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
//         if (!exam) {
//           res.sendStatus(404);
//           return;
//         }

//         req.files && exam.addSubmissions(<Express.Multer.File[]>req.files);

//         res.sendStatus(200);
//       }
//     ]
//   }));

// exams_router
//   .route("/:exam_id/submissions/:submission_uuid")
//   .delete(createRoute({
//     preprocessing: NO_PREPROCESSING,
//     validation: [
//       validateParamExammaRayId("exam_id"),
//       validateParamUuid("submission_uuid"),
//     ],
//     authorization: requireAdmin,
//     handler: async (req: Request, res: Response) => {
//       const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
//       if (!exam) {
//         res.sendStatus(404);
//         return;
//       }

//       await exam.deleteSubmissionByUuid(req.params["submission_uuid"]);

//       res.sendStatus(204);
//     }
//   }))
//   .post(createRoute({
//     preprocessing: NO_PREPROCESSING,
//     validation: [
//       validateParamExammaRayId("exam_id")
//     ],
//     authorization: requireAdmin,
//     handler: [
//       upload.array("submissions"),
//       async (req: Request, res: Response) => {
//         const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);
//         if (!exam) {
//           res.sendStatus(404);
//           return;
//         }

//         req.files && exam.addSubmissions(<Express.Multer.File[]>req.files);

//         res.sendStatus(200);
//       }
//     ]
//   }));





// exams_router
//   .route("/:exam_id/instances/:exam_instance_uuid/uuidv5_namespace")
//   .put(createRoute({
//     preprocessing: jsonBodyParser,
//     validation: [
//       validateParamExammaRayId("exam_id"),
//       validateParamUuid("exam_instance_uuid"),
//       validateBody("uuidv5_namespace").isUUID(),
//     ],
//     authorization: requireAdmin,
//     handler: [
//       async (req: Request, res: Response) => {
//         const exam_inst = EXAMMA_RAY_GRADING_SERVER
//           .getExamServer(req.params["exam_id"])
//           ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

//         if (!exam_inst) {
//           return res.sendStatus(404);
//         }

//         await exam_inst.setUuidV5Namespace(req.body.uuidv5_namespace);

//         // We don't await this, let it run async
//         exam.generateExams();

//         return res.sendStatus(204);
//       }
//     ]
//   }));

exams_router
  .route("/:exam_id/epoch")
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

      res.status(200).send(exam.getEpoch());
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
        return res.sendStatus(404);
      }
      res.status(200).json(exam.getActiveGraders());
    }
  }));



exams_router
  .route("/:exam_id/instances")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id")
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"])
      
      if (!exam) {
        return res.sendStatus(404);
      }

      return res.status(200).json(exam.getExamInstances().map(ei => ei.getInfo()));
    }
  }))
  .post(createRoute({
    authorization: requireAdmin, // requireSuperUser,
    preprocessing: jsonBodyParser,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateBody("name").trim().isLength({min: 1, max: 200}),
      // TODO: verify the way sanitizers work in express-validator
      validateBody("duration_seconds").toInt().isInt({min: 1}),
      validateBody("uuidv5_namespace").isUUID().optional(),
      validateBody("randomization_seed").trim().isLength({min: 1, max: 100}).optional(),
    ],
    handler: async (req: Request, res: Response) => {
      const exam = EXAMMA_RAY_GRADING_SERVER.getExamServer(req.params["exam_id"]);

      if (!exam) {
        return res.sendStatus(404);
      }
      const exam_instance = await exam.createExamInstance(
        req.body.name,
        req.body.duration_seconds,
        req.body.uuidv5_namespace,
        req.body.randomization_seed
      );
      return res.status(201).json(exam_instance.getInfo());
    }
  }));


exams_router
  .route("/:exam_id/instances/:exam_instance_uuid")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      res.status(200).send(exam_inst.getInfo());
    }
  }));

exams_router
  .route("/:exam_id/instances/:exam_instance_uuid/epoch")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      res.status(200).send(exam_inst.getEpoch());
    }
  }));


exams_router
  .route("/:exam_id/instances/:exam_instance_uuid/tasks")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      res.status(200).json(exam_inst.getTaskStatus());
    }
  }));

exams_router
  .route("/:exam_id/instances/:exam_instance_uuid/windows")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      res.status(200).json(exam_inst.getWindows());
    }
  }))
  .put(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: requireAdmin,
    handler: [
      upload.single("windows"),
      async (req: Request, res: Response) => {
        const exam_inst = EXAMMA_RAY_GRADING_SERVER
          .getExamServer(req.params["exam_id"])
          ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

        if (!exam_inst) {
          return res.sendStatus(404);
        }

        if (!req.file) {
          return res.sendStatus(400);
        }

        const uploaded_filepath = `uploads/${req.file?.filename}`;


        type UploadedWindow = {
          window_uuid?: string;
          name?: string;
          open_time?: string; // ISO 8601 datetime string
          close_time?: string;   // ISO 8601 datetime string
        };

        // TODO: can we make this async? (probably not a huge deal, but still)
        let uploaded_windows = Papa.parse<UploadedWindow>(readFileSync(uploaded_filepath, "utf8"), {
          header: true,
          skipEmptyLines: true
        }).data;

        // clean objects so they don't have extra properties
        try {
          const cleaned_windows = uploaded_windows.map(w => ({
            window_uuid: assertExists(w.window_uuid, `Missing window_uuid for window with name ${JSON.stringify(w)}`),
            name: assertExists(w.name, `Missing name for window with uuid ${JSON.stringify(w)}`),
            open_time: new Date(assertExists(w.open_time, `Missing open_time for window with uuid ${JSON.stringify(w)}`)),
            close_time: new Date(assertExists(w.close_time, `Missing close_time for window with uuid ${JSON.stringify(w)}`)),
          }));

          await exam_inst.addWindows(cleaned_windows);

          return res.sendStatus(201);
        }
        catch(e) {
          return res.status(400).send(`Error adding windows: ${e}`);
        }
        finally {
          await rm(uploaded_filepath, { force: true });
        }
      }
    ]
  }));

exams_router
  .route("/:exam_id/instances/:exam_instance_uuid/roster")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      res.status(200).json(exam_inst.getRoster());
    }
  }))
  // .put(createRoute({
  //   preprocessing: NO_PREPROCESSING,
  //   validation: [
  //     validateParamExammaRayId("exam_id")
  //   ],
  //   authorization: requireAdmin,
  //   handler: [
  //     upload.single("roster"),
  //     async (req: Request, res: Response) => {
  //       const exam_inst = EXAMMA_RAY_GRADING_SERVER
  //         .getExamServer(req.params["exam_id"])
  //         ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

  //       if (!exam_inst) {
  //         return res.sendStatus(404);
  //       }

  //       if (!req.file) {
  //         return res.sendStatus(400);
  //       }

  //       const uploaded_filepath = `uploads/${req.file?.filename}`;

  //       // TODO: can we make this async? (probably not a huge deal, but still)
  //       let roster = ExamUtils.loadCSVRoster(uploaded_filepath);

  //       await exam_inst.addToRoster(roster);

  //       await rm(uploaded_filepath, { force: true });
  //       return res.sendStatus(201);
  //     }
  //   ]
  // }));
  .put(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: requireAdmin,
    handler: [
      upload.single("roster"),
      async (req: Request, res: Response) => {
        const exam_inst = EXAMMA_RAY_GRADING_SERVER
          .getExamServer(req.params["exam_id"])
          ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

        if (!exam_inst) {
          return res.sendStatus(404);
        }

        if (!req.file) {
          return res.sendStatus(400);
        }

        const uploaded_filepath = `uploads/${req.file?.filename}`;

        type UploadedRosterEntry = {
          uniqname?: string;
          email?: string;
          name?: string;
          window_uuid?: string;
          duration_multiplier?: string;
        };

        // TODO: can we make this async? (probably not a huge deal, but still)
        let uploaded_roster = Papa.parse<UploadedRosterEntry>(readFileSync(uploaded_filepath, "utf8"), {
          header: true,
          skipEmptyLines: true
        }).data;

        // clean objects so they don't have extra properties
        try {
          const cleaned_roster = uploaded_roster.map(r => ({
            uniqname: assertExists(r.uniqname, `Missing uniqname for roster entry with email ${JSON.stringify(r)}`),
            student_email: r.email ?? r.uniqname + "@umich.edu",
            name: r.name,
            window_uuid: r.window_uuid,

            // If it's undefined, empty string, or 0, we default to undefined (no multiplier),
            // otherwise parse as a float. If that fails, NaN is als falsy and we default to undfined.
            duration_multiplier: (r.duration_multiplier && parseFloat(r.duration_multiplier)) || undefined
          }));
          
          await exam_inst.updateRoster(cleaned_roster);

          return res.sendStatus(201);
        }
        catch(e) {
          return res.status(400).send(`Error adding windows: ${e}`);
        }
        finally {
          await rm(uploaded_filepath, { force: true });
        }
      }
    ]
  }));
  

exams_router
  .route("/:exam_id/instances/:exam_instance_uuid/assigned_exams")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      res.status(200).json(exam_inst.getAssignedExams());
    }
  }));

exams_router
  .route("/:exam_id/instances/:exam_instance_uuid/submissions")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      res.status(200).json(await exam_inst.getSubmissions());
    }
  }));

exams_router
  .route("/:exam_id/instances/:exam_instance_uuid/assigned_exams_by_uniqname/:uniqname")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParamExammaRayId("exam_id"),
      validateParamUuid("exam_instance_uuid"),
      validateParamExammaRayId("uniqname"),
    ],
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const exam_inst = EXAMMA_RAY_GRADING_SERVER
        .getExamServer(req.params["exam_id"])
        ?.getExamInstanceByUuid(req.params["exam_instance_uuid"]);

      if (!exam_inst) {
        return res.sendStatus(404);
      }

      const assignment = exam_inst.getAssignedExamByUniqname(req.params["uniqname"]);
      if (!assignment) {
        return res.sendStatus(404);
      }

      return res.status(200).json(assignment);
    }
  }))