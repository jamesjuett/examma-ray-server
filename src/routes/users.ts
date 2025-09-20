import { Request, Response, Router } from "express";
import { getJwtUserInfo, isAdmin, isStaff } from "../auth/jwt_auth";
import { db_getUserByEmail } from "../db/db_user";
import { createRoute, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION } from "./common";

// NOTE: The lack of authorization on these routes is because they
// operate on resources owned by the current user. Thus, the authentication
// they've already gone through with their JWT already verfies the
// request is legit and they are authorized to access these resources.

export const users_router = Router();
users_router.route("/me")
  .get(createRoute({
    preprocessing: NO_PREPROCESSING,
    validation: NO_VALIDATION,
    authorization: NO_AUTHORIZATION,
    handler: async (req: Request, res: Response) => {
      let userInfo = getJwtUserInfo(req);
      let user = await db_getUserByEmail(userInfo.email);
      if (user) {
        res.status(200);
        res.json(Object.assign(user,{
          is_staff: isStaff(user.email),
          is_admin: isAdmin(user.email)
        }));
      }
      else {
        res.status(404);
        res.send("This user does not exist.");
      }
    }
  }));

