import { Request, Response, Router } from "express";
import { getJwtUserInfo } from "../auth/jwt_auth";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION } from "./common";

export const student_router = Router();
student_router
  .route("/exams")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      const userInfo = getJwtUserInfo(req);
      return res.status(200).json([
        {exam_id: "test1" + userInfo.email},
        {exam_id: "test2" + userInfo.email}
      ]);
    }
  }));
