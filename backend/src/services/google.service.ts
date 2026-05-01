import { google } from "googleapis";
import { env } from "../config/env.js";

// Initialize the official Google OAuth2 Client
export const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);