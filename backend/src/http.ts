import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const asyncHandler = (handler: RequestHandler): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error && typeof error === "object" && "name" in error && error.name === "MulterError") {
    response.status(413).json({ error: "Media upload exceeds the configured limits" });
    return;
  }
  if (error instanceof ZodError) {
    response.status(422).json({ error: "Validation failed", issues: error.issues.map(({ path, message }) => ({ path, message })) });
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error("Unhandled request error", error instanceof Error ? error.message : error);
  response.status(500).json({ error: "Internal server error" });
};
