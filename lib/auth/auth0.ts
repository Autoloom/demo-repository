import { Auth0Client } from "@auth0/nextjs-auth0/server";

const HOURS = 60 * 60;

export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
  },
  session: {
    // Ask user to relogin after this much time since last login
    absoluteDuration: 20 * HOURS,
    // Ask user to relogin in inactive for this much time
    inactivityDuration: 12 * HOURS,
  },
});
