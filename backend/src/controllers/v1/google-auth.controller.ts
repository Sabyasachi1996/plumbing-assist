import { Request, Response } from "express";
import { oauth2Client } from "../../services/google.service.js";
import { db } from "../../db/index.js";

// IMPORTANT: Change this if your Vite React app is running on a different port!
const FRONTEND_URL = "http://localhost:5173"; 

export const googleAuthController = {
  async getAuthUrl(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.query.companyId as string;

      if (!companyId) {
        res.status(400).json({ error: "companyId is required." });
        return;
      }

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/calendar.events"],
        state: companyId,
      });

      // FIX 1: Redirect the browser directly to Google's consent screen
      res.redirect(authUrl);
    } catch (error) {
      console.error("Error generating auth url:", error);
      res.status(500).json({ error: "Failed to generate Google login URL." });
    }
  },

  async callback(req: Request, res: Response): Promise<void> {
    try {
      const code = req.query.code as string;
      const companyId = req.query.state as string;

      if (!code || !companyId) {
        res.status(400).send("Invalid request. Missing code or state.");
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);

      if (tokens.refresh_token) {
        await db.company.update({
          where: { id: companyId },
          data: { googleRefreshToken: tokens.refresh_token },
        });
      }

      // FIX 2: Send them right back to the React Dashboard after linking!
      res.redirect(`${FRONTEND_URL}/`);
    } catch (error) {
      console.error("Google Auth Callback Error:", error);
      res.redirect(`${FRONTEND_URL}/?error=calendar_failed`);
    }
  },
};