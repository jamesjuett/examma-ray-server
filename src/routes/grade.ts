import { Request, Response, Router } from "express";
import { query } from "../db/db";
import { createRoute, jsonBodyParser, NO_AUTHORIZATION, NO_PREPROCESSING, NO_VALIDATION } from "./common";
import { Worker } from "worker_threads";
// const validateParamShortName = validateParam("short_name").trim().isLength({min: 1, max: 20});
// const validateParamTerm = validateParam("term").isIn(["fall", "winter", "spring", "summer"]);
// const validateParamYear = validateParam("year").isInt();

// const validateBodyShortName = validateBody("short_name").trim().isLength({min: 1, max: 20});
// const validateBodyFullName = validateBody("full_name").trim().isLength({min: 1, max: 100});
// const validateBodyTerm = validateBody("term").isIn(["fall", "winter", "spring", "summer"]);
// const validateBodyYear = validateBody("year").isInt();

// const validateBodyCourse = [
//   validateBodyShortName,
//   validateBodyFullName,
//   validateBodyTerm,
//   validateBodyYear
// ];



// async function requireCourseAdmin(req: Request, res: Response, next: NextFunction) {
//   let user_id = getJwtUserInfo(req).id;
//   let course_id = parseInt(req.params["id"]);

//   if (await isCourseAdmin(user_id, course_id)) {
//     return next();
//   }
//   else {
//     // Not authorized
//     res.sendStatus(403);
//   }

// }

export const getCoursesRoute = createRoute({
  preprocessing: NO_PREPROCESSING,
  validation: NO_VALIDATION,
  authorization: NO_AUTHORIZATION,
  handler: async (req: Request, res: Response) => {
    res.status(200);
    res.json(await query("courses").select());
  }
});


// export const getCourseByIdRoute = createRoute({
//   preprocessing: NO_PREPROCESSING,
//   validation: validateParamId,
//   authorization: NO_AUTHORIZATION,
//   handler: async (req: Request, res: Response) => {
//     let course = await getCourse(parseInt(req.params["id"]));
//     if (course) {
//       res.status(200);
//       res.json(course);
//     }
//     else {
//       res.status(404);
//       res.send("This course does not exist.");
//     }
//   }
// });

// export const getCourseByShortNameTermYearRoute = createRoute({
//   preprocessing: NO_PREPROCESSING,
//   validation: [
//     validateParamShortName,
//     validateParamTerm,
//     validateParamYear,
//   ],
//   authorization: NO_AUTHORIZATION,
//   handler: async (req: Request, res: Response) => {
//     let course = getCourseByShortNameTermYear(
//       req.params["short_name"],
//       req.params["term"],
//       parseInt(req.params["year"])
//     );
      
//     if (course) {
//       res.status(200);
//       res.json(course);
//     }
//     else {
//       res.status(404);
//       res.send("This course does not exist.");
//     }
//   }
// });

export const grading_router = Router();
grading_router
  .post("/", createRoute({
    authorization: NO_AUTHORIZATION, // requireSuperUser,
    preprocessing: jsonBodyParser,
    validation: [
      // validateBody("id").not().exists(),
      // ...validateBodyCourse,
    ],
    handler: async (req: Request, res: Response) => {
      process.chdir("exams");
      const worker = new Worker("../build/run/grade.js")
      process.chdir("..");
      res.status(200).json("Testasdfasfas");
      // let body = req.body;
      // await query("courses").insert({
      //   short_name: body.short_name!,
      //   full_name: body.full_name!,
      //   term: body.term!,
      //   year: body.year!,
      // });
      // res.sendStatus(201);
    }
  }));
