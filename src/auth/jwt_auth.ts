import passport from "passport";
import passportJwt from "passport-jwt";
import { auth_config } from "../auth/config";
import jsonwebtoken from "jsonwebtoken";
import { Request } from "express";
import { assert } from "console";


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