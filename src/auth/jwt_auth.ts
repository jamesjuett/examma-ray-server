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
  "adviti@umich.edu",
  "aravikum@umich.edu",
  "akorot@umich.edu",
  "aakhalid@umich.edu",
  "stoneann@umich.edu",
  "ashpatel@umich.edu",
  "ashvink@umich.edu",
  "brightxu@umich.edu",
  "ciheanyi@umich.edu",
  "chrzhang@umich.edu",
  "clsun@umich.edu",
  "babila@umich.edu",
  "djgoreli@umich.edu",
  "elainezh@umich.edu",
  "eylu@umich.edu",
  "eyuan@umich.edu",
  "egriffis@umich.edu",
  "ecash@umich.edu",
  "fiahmed@umich.edu",
  "gurish@umich.edu",
  "iabouara@umich.edu",
  "imanmal@umich.edu",
  "jjuett@umich.edu",
  "jbbeau@umich.edu",
  "joshsieg@umich.edu",
  "jcaoun@umich.edu",
  "jsliu@umich.edu",
  "metzkm@umich.edu",
  "kamiz@umich.edu",
  "musicer@umich.edu",
  "leheng@umich.edu",
  "fimaria@umich.edu",
  "miavuc@umich.edu",
  "mipeng@umich.edu",
  "mmliu@umich.edu",
  "nehark@umich.edu",
  "nuppula@umich.edu",
  "pmathena@umich.edu",
  "qinjuanx@umich.edu",
  "raiyahmd@umich.edu",
  "rosendon@umich.edu",
  "sjaehnig@umich.edu",
  "schabseb@umich.edu",
  "patis@umich.edu",
  "sofias@umich.edu",
  "chapmwt@umich.edu",
  "tditmars@umich.edu",
  "vnaray@umich.edu",
  "qwzhao@umich.edu",
  "zwgold@umich.edu",
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