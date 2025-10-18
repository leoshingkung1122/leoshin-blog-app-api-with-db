import { Request, Response, NextFunction } from "express";
import { AppError, ErrorResponse } from "../utils/errors";

// Error logging utility
const logError = (error: Error, req: Request) => {
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
};

// Global error handling middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
) => {
  // Log the error
  logError(error, req);

  // Default error values
  let statusCode = 500;
  let message = "Internal Server Error";
  let stack: string | undefined;

  // Handle custom AppError instances
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    
    // Only show stack in development
    if (process.env.NODE_ENV === 'development') {
      stack = error.stack;
    }
  } else {
    // Handle unexpected errors
    if (process.env.NODE_ENV === 'development') {
      message = error.message;
      stack = error.stack;
    }
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(stack && { stack }),
    },
  });
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for undefined routes
export const notFoundHandler = (req: Request, res: Response<ErrorResponse>) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
};

// Validation error handler
export const validationErrorHandler = (errors: string[]) => {
  return (req: Request, res: Response) => {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        statusCode: 400,
        timestamp: new Date().toISOString(),
        path: req.path,
        details: errors,
      },
    });
  };
};
