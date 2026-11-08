export type ErrorCode = 'not_found' | 'forbidden' | 'invalid' | 'conflict';

/** Expected failure that the API turns into a 4xx response and the bot into a friendly reply. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError('not_found', `${what} not found`);
export const forbidden = (why: string) => new AppError('forbidden', why);
export const invalid = (why: string) => new AppError('invalid', why);
export const conflict = (why: string) => new AppError('conflict', why);
