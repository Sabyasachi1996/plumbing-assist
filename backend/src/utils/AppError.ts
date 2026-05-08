export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    // isOperational indicates this is a predictable, handled error (e.g., "User not found")
    // rather than an unknown programming bug (e.g., Cannot read property of undefined)
    this.isOperational = true;
    // Captures the stack trace, excluding the constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }
}