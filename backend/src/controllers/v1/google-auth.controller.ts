import { Request, Response } from "express";
import { oauth2Client } from "../../services/google.service.js";
import { companyRepository } from "../../repositories/company.repository.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";

const FRONTEND_URL = "http://localhost:5173"; 

export const googleAuthController = {
  
  getAuthUrl: asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.query.companyId as string;

    if (!companyId) {
      throw new AppError("companyId is required.", 400);
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/calendar.events"],
      state: companyId,
    });

    res.redirect(authUrl);
  }),

  // We DO NOT use asyncHandler here because we want to redirect the browser on failure, not send JSON.
  async callback(req: Request, res: Response): Promise<void> {
    try {
      const code = req.query.code as string;
      const companyId = req.query.state as string;

      if (!code || !companyId) {
        res.redirect(`${FRONTEND_URL}/?error=invalid_request`);
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);

      if (tokens.refresh_token) {
        await companyRepository.updateGoogleToken(companyId, tokens.refresh_token);
      }

      res.redirect(`${FRONTEND_URL}/`);
    } catch (error) {
      console.error("Google Auth Callback Error:", error);
      res.redirect(`${FRONTEND_URL}/?error=calendar_failed`);
    }
  },
};