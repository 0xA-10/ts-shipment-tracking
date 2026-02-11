import { AxiosError } from "axios";
import { Middleware, NextFunction } from "./types";
import { MiddlewareContext, TrackingResult } from "../types";

export type RetryOptions = {
  /** Maximum number of retry attempts. Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseDelayMs?: number;
};

export class RetryMiddleware implements Middleware {
  private maxAttempts: number;
  private baseDelayMs: number;

  constructor(options?: RetryOptions) {
    this.maxAttempts = options?.maxAttempts ?? 3;
    this.baseDelayMs = options?.baseDelayMs ?? 1000;
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      return status === 429 || (status != null && status >= 500);
    }
    return false;
  }

  async execute(ctx: MiddlewareContext, next: NextFunction): Promise<TrackingResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await next();
      } catch (err) {
        lastError = err;
        if (!this.isRetryable(err) || attempt === this.maxAttempts - 1) {
          throw err;
        }
        const delay = this.baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
