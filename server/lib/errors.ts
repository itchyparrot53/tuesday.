export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(what = 'Not found'): AppError {
  return new AppError(404, 'not_found', what);
}

export function forbidden(message = 'You do not have permission to do that'): AppError {
  return new AppError(403, 'forbidden', message);
}

export function conflict(message: string): AppError {
  return new AppError(409, 'conflict', message);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'validation_error', message, details);
}
