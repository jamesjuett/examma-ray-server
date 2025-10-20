import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import { param as validateParam, ValidationChain, validationResult } from 'express-validator';

// Body parsers
export const jsonBodyParser_small_1MB = express.json({limit: "1MB"});
export const jsonBodyParser_large_10MB = express.json({limit: "10MB"});
export const urlencodedBodyParser = express.urlencoded({ extended: false });

// NOTE: validate then sanitize is more strict
//       than sanitize then validate
//       e.g. for client sending a string "123a"
//       validate then sanitize will fail validation
//       sanitize then validate will pass validation
//       (because it will be sanitized to "123" via implicit conversion)
// NOTE: Sanitize on its own is no good, since e.g. it might give a NaN
//       rather than failing validation and rejecting input.
// OVERALL: May want to only validate, then manually parse in subsequent handler
//          for improved type safety (i.e. treat the param/body as string/any
//          and then parseInt/parseFloat/Date/other as needed).
export { body as validateBody, param as validateParam } from 'express-validator';

function requireAllValid(req: Request, res: Response, next: NextFunction) {
  let vr = validationResult(req);
  if (vr.isEmpty()) {
    next();
  }
  else {
    res.status(400).json({ errors: vr.array() });
  }
}

// export async function requireSuperUser(req: Request, res: Response, next: NextFunction) {
//   let user_id = getJwtUserInfo(req).id;

//   if (await isSuperUser(user_id)) {
//     return next();
//   }
//   else {
//     // Not authorized
//     res.sendStatus(403);
//   }

// }

export interface CommonRouteHandlers {
  authorization: RequestHandler | readonly RequestHandler[];
  preprocessing: RequestHandler | readonly RequestHandler[];
  validation: ValidationChain | readonly ValidationChain[];
  handler: RequestHandler | readonly RequestHandler[];
};

export function createRoute(handlers: CommonRouteHandlers) {
  
  return [
    ...(Array.isArray(handlers.authorization) ? handlers.authorization : [handlers.authorization]),
    ...(Array.isArray(handlers.preprocessing) ? handlers.preprocessing : [handlers.preprocessing]),
    ...(Array.isArray(handlers.validation) ? handlers.validation : [handlers.validation]),
    requireAllValid,
    ...(Array.isArray(handlers.handler) ? handlers.handler : [handlers.handler]),
  ];
}

export const NO_PREPROCESSING = [] as readonly never[];
export const NO_VALIDATION = [] as readonly never[];
export const NO_AUTHORIZATION = [] as readonly never[];


export function validateParamExammaRayId(param_name: string) {
  return validateParam(param_name).trim().isLength({min: 1, max: 100});
}

export function validateParamExammaRayName(param_name: string) {
  return validateParam(param_name).trim().isLength({min: 1, max: 200});
}

export function validateParamUuid(param_name: string) {
  return validateParam(param_name).trim().isUUID();
}

