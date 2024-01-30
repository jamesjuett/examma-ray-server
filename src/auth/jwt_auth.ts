import { assert } from "console";
import { NextFunction, Request, Response } from "express";
import jsonwebtoken from "jsonwebtoken";
import passport from "passport";
import passportJwt from "passport-jwt";
import { auth_config } from "../auth/config";


export interface JwtUserInfo {
  email: string;
};

/**
 * DO NOT use unless on a route that has already passed through
 * the JWT authentication middleware.
 */
export function getJwtUserInfo(req: Request) {
  assert(req.user);
  return req.user as JwtUserInfo;
}

passport.use("jwt-bearer", new passportJwt.Strategy(
  auth_config.jwt_bearer, (payload, done) => {
    const user = {email: payload.sub};
    return done(null, user, payload);
  }
));

passport.use("jwt-cookie", new passportJwt.Strategy(
  auth_config.jwt_cookie, (payload, done) => {
    const user = {email: payload.sub};
    return done(null, user, payload);
  }
));

export function generateJwt(email: string) {
  return jsonwebtoken.sign(
    {}, // empty payload, all we need for now is user id as subject
    auth_config.jwt_bearer.secretOrKey,
    {
      // No expiration
      subject: email
    }
  );
}




const ADMIN = new Set<string>([
  "jjuett@umich.edu",
]);

const STAFF = new Set<string>([
  "akamil@umich.edu",
  "awdeorio@umich.edu",
  "bogaerts@umich.edu",
  "jbbeau@umich.edu",
  "jklooste@umich.edu",
  "jjuett@umich.edu",
  "razak@umich.edu",
  "sofias@umich.edu",
]);

function requireAuthorization(group: Set<string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    let userInfo = getJwtUserInfo(req);
    if (group.has(userInfo.email)) {
      next();
    }
    else {
      res.sendStatus(403);
      console.log(`Blocked access by: ${userInfo.email}`);
    }
  }
}

export const requireStaff = requireAuthorization(STAFF);
export const requireAdmin = requireAuthorization(ADMIN);