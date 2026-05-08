import { Request, Response, NextFunction } from "express";

// Wraps async express routes to automatically catch errors and pass them to next()
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};