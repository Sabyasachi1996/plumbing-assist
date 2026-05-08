import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Log the error. Include req.path to know which route failed
  if (statusCode >= 500) {
    logger.error(`[${req.method} ${req.path}] ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`[${req.method} ${req.path}] ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    // Only leak stack traces in development mode for security
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};