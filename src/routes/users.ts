import { Request, Response, Router } from "express";
import { getJwtUserInfo } from "../auth/jwt_auth";
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
        res.json(user);
      }
      else {
        res.status(404);
        res.send("This user does not exist.");
      }
    }
  }));

// users_router.route("/me/projects")
//   .get(createRoute({
//     preprocessing: NO_PREPROCESSING,
//     validation: NO_VALIDATION,
//     authorization: NO_AUTHORIZATION,
//     handler: async (req: Request, res: Response) => {
//       let userInfo = getJwtUserInfo(req);
//       let projects = await getUserProjectsById(userInfo.id);
//       assert(projects);
//       res.status(200).json(projects);
//     }
//   }));

// users_router.route("/:id/projects")
//   .get(createRoute({
//     preprocessing: NO_PREPROCESSING,
//     validation: validateParamId,
//     authorization: NO_AUTHORIZATION,
//     handler: async (req: Request, res: Response) => {
//       let projects = await getUserProjectsById(parseInt(req.params["id"]));
//       assert(projects);
//       res.status(200).json(projects);
//     }
//   }));




// async function getUserProjectsById(id: number) {
//   return await query("projects")
//     .join("users_projects", "projects.id", "users_projects.project_id")
//     .select("projects.*").where({user_id: id});
// }