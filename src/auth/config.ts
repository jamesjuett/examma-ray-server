import { Request } from "express";
import passportJwt from "passport-jwt";
import { dotenv_config, getDockerSecret } from "../util/backend_util";
import { assertExists } from "../util/util";

dotenv_config()

export const auth_config = {
  google: {
    clientID: assertExists(process.env.GOOGLE_CLIENT_ID),
    clientSecret: getDockerSecret("google_client_secret"),
    callbackURL: assertExists(process.env.GOOGLE_CALLBACK_URL)
  },

  participation: {
    clientID: assertExists(process.env.PARTICIPATION_CLIENT_ID)
  },

  jwt_bearer: {
    jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: getDockerSecret("jwt_secret")
  },

  jwt_cookie: {
    jwtFromRequest: (req: Request) => {
      const cookies = req?.cookies;
      return cookies ? cookies["bearer"] : null;
    },
    secretOrKey: getDockerSecret("jwt_secret")
  }
}