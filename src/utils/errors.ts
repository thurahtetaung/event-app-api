import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public errors?: any[],
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errors?: any[]) {
    super(400, message, 'VALIDATION_ERROR', errors);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(403, message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    errors?: any[];
  };
}

export const handleError = (
  error: Error | AppError | ZodError | FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  // Log the error with request context
  logger.error(
    `Error at ${request.method} ${request.url}: ${error.message}\nStack: ${error.stack}`,
  );

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: error.errors,
      },
    };
    return reply.status(400).send(response);
  }

  // Handle custom AppError
  if (error instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
        errors: error.errors,
      },
    };
    return reply.status(error.statusCode).send(response);
  }

  // Handle Supabase errors (they come as regular Error objects)
  if (error.message.includes('Supabase') || error.message.includes('OTP')) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: error.message,
      },
    };
    return reply.status(401).send(response);
  }

  // Handle Fastify errors
  if ((error as FastifyError).statusCode) {
    const fastifyError = error as FastifyError;
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: fastifyError.message,
      },
    };
    return reply.status(fastifyError.statusCode || 500).send(response);
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
  return reply.status(500).send(response);
};
