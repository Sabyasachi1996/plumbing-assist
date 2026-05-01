import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// We extend the Express Request type so TypeScript knows 'user' exists
export interface AuthRequest extends Request {
  user?: {
    companyId: string;
    email: string;
  };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  // Tokens are usually sent in the header as: "Bearer eyJhbGci..."
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized. No token provided." });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { companyId: string; email: string };
    req.user = decoded; // Attach the decoded payload to the request
    next(); // Pass control to the actual controller
  } catch (error) {
    res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
  }
};