import { Request, Response, Router } from "express";
import { readFileSync } from "fs";
import { rm } from "fs/promises";
import multer from "multer";
import Papa from "papaparse";
import { requireAdmin, requireSuper } from "../auth/jwt_auth";
import { db_assignUsersToSections, db_getAllCourses, db_getAllCourseUsers, db_getCourseSections, db_getCourseUsersByRole, db_upsertCourseSections, db_upsertUsersToCourseRosterWithRole } from "../db/db_courses";
import { assertExists } from "../util/util";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION, validateParam } from "./common";

const upload = multer({
  dest: "uploads/"
});

type UploadedRosterEntry = {
  email?: string;
  name?: string;
  section_id?: string;
};

function parseAndCleanUploadedRoster(uploaded_filepath: string) {
  // TODO: can we make this async? (probably not a huge deal, but still)
  let uploaded_roster = Papa.parse<UploadedRosterEntry>(readFileSync(uploaded_filepath, "utf8"), {
    header: true,
    skipEmptyLines: true
    // dynamicTyping: defaults to false, which means everything is a string
  }).data;

  const cleaned_roster = uploaded_roster.map(r => ({
    email: assertExists(r.email, `Missing email for roster row ${JSON.stringify(r)}`),
    name: assertExists(r.name, `Missing name for roster row ${JSON.stringify(r)}`),
    section_id: r.section_id || undefined,
  }));

  // convert email strings to lowercase
  cleaned_roster.forEach(r => {
    r.email = r.email.toLowerCase();
  });

  return cleaned_roster;
}

function createUploadRosterHandler(role: "student" | "staff" | "admin") {
  return async (req: Request, res: Response) => {
    const course_pk = parseInt(req.params["course_pk"]);
    const uploaded_filepath = `uploads/${req.file?.filename}`;

    // clean objects so they don't have extra properties
    try {
      const cleaned_roster = parseAndCleanUploadedRoster(uploaded_filepath);
      
      // Add users
      await db_upsertUsersToCourseRosterWithRole(
        course_pk,
        cleaned_roster.map(r => ({ email: r.email, name: r.name })),
        role
      );

      // Load sections
      const sections_by_id = new Map((await db_getCourseSections(course_pk)).map(s => [s.section_id, s]));
      
      // Partition users into those with and without valid sections
      const users_with_valid_sections = cleaned_roster.map(r => {
        if (!r.section_id) return undefined;
        const section = sections_by_id.get(r.section_id);
        if (section) {
          return {
            email: r.email,
            section_pk: section.section_pk,
          }
        }
        else {
          console.warn(`Warning: Skipping invalid section_id ${r.section_id} for user ${r.email}`);
          return undefined;
        }
      }).filter(r => r !== undefined);

      // Assign users to sections
      await db_assignUsersToSections(users_with_valid_sections);
      
      return res.sendStatus(201);
    }
    catch(e) {
      return res.status(400).send(`Error adding roster: ${e}`);
    }
    finally {
      await rm(uploaded_filepath, { force: true });
    }
  }
}




export const courses_router = Router();
courses_router
  .route("/")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION, // TODO: only show courses that staff own
    handler: async (req: Request, res: Response) => {
      return res.status(200).json(await db_getAllCourses());
    }
  }));

courses_router
  .route("/:course_pk/sections")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    authorization: requireAdmin,
    validation: [
      validateParam("course_pk").isInt(),
    ],
    handler: async (req: Request, res: Response) => {
      return res.status(200).json({
        roster: await db_getAllCourseUsers(parseInt(req.params["course_pk"]))
      });
    }
  }))
  .put(createRoute({
    authorization: requireAdmin,
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParam("course_pk").isInt(),
    ],
    handler: [
      upload.single("sections"),
      async (req: Request, res: Response) => {
        const course_pk = parseInt(req.params["course_pk"]);
        const uploaded_filepath = `uploads/${req.file?.filename}`;

        type UploadedSectionsEntry = {
          section_id?: string;
          section_name?: string;
        };

        // TODO: can we make this async? (probably not a huge deal, but still)
        let uploaded_sections = Papa.parse<UploadedSectionsEntry>(readFileSync(uploaded_filepath, "utf8"), {
          header: true,
          skipEmptyLines: true
          // dynamicTyping: defaults to false, which means everything is a string
        }).data;

        // clean objects so they don't have extra properties
        try {
          const cleaned_sections = uploaded_sections.map(r => ({
            course_pk: course_pk,
            section_id: assertExists(r.section_id, `Missing section_id for section row ${JSON.stringify(r)}`),
            section_name: assertExists(r.section_name, `Missing section_name for section row ${JSON.stringify(r)}`),
          }));

          // Add sections
          await db_upsertCourseSections(cleaned_sections);
          
          return res.sendStatus(201);
        }
        catch(e) {
          return res.status(400).send(`Error adding sections: ${e}`);
        }
        finally {
          await rm(uploaded_filepath, { force: true });
        }
      }
    ]
  }));

courses_router
  .route("/:course_pk/users")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    authorization: NO_AUTHORIZATION,
    validation: [
      validateParam("course_pk").isInt(),
    ],
    handler: async (req: Request, res: Response) => {
      return res.status(200).json({
        roster: await db_getAllCourseUsers(parseInt(req.params["course_pk"]))
      });
    }
  }))

courses_router
  .route("/:course_pk/student_roster")
  .get(createRoute({
    authorization: NO_AUTHORIZATION,
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParam("course_pk").isInt(),
    ],
    handler: async (req: Request, res: Response) => {
      return res.status(200).json({
        students: await db_getCourseUsersByRole(parseInt(req.params["course_pk"]), "student")
      });
    }
  }))
  .put(createRoute({
    authorization: requireSuper,
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParam("course_pk").isInt(),
    ],
    handler: [
      upload.single("student_roster"),
      createUploadRosterHandler("student")
    ]
  }));


courses_router
  .route("/:course_pk/staff_roster")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    authorization: NO_AUTHORIZATION,
    validation: [
      validateParam("course_pk").isInt(),
    ],
    handler: async (req: Request, res: Response) => {
      return res.status(200).json({
        staff: await db_getCourseUsersByRole(parseInt(req.params["course_pk"]), "staff")
      });
    }
  }))
  .put(createRoute({
    authorization: requireSuper,
    preprocessing: NO_PREPROCESSING,
    validation: [
      validateParam("course_pk").isInt(),
    ],
    handler: [
      upload.single("staff_roster"),
      createUploadRosterHandler("staff")
    ]
  }));