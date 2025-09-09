import { Request, Response, Router } from "express";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION } from "./common";
import { db_getLiveExamAssignmentsByEmail } from "../db/db_live";

export const student_router = Router();
student_router
  .route("/exams")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      return res.status(200).json(await db_getLiveExamAssignmentsByEmail(userInfo.email));
    }
  }));
