import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { AppError } from "../utils/AppError.js";

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Extract just the error messages and join them into a readable string
    const errorMessages = errors.array().map((err) => err.msg).join(", ");
    return next(new AppError(`Validation Error: ${errorMessages}`, 400));
  }
  next();
};