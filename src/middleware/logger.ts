import { Middleware, NextFunction } from "./types";
import { MiddlewareContext, TrackingResult } from "../types";

export type LoggerOptions = {
  log?: (message: string) => void;
};

export class LoggerMiddleware implements Middleware {
  private log: (message: string) => void;

  constructor(options?: LoggerOptions) {
    this.log = options?.log ?? console.log;
  }

  async execute(ctx: MiddlewareContext, next: NextFunction): Promise<TrackingResult> {
    const start = Date.now();
    this.log(`[tracking] ${ctx.courierCode}:${ctx.trackingNumber} - start`);

    try {
      const result = await next();
      const duration = Date.now() - start;
      this.log(`[tracking] ${ctx.courierCode}:${ctx.trackingNumber} - success (${duration}ms)`);
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.log(
        `[tracking] ${ctx.courierCode}:${ctx.trackingNumber} - error (${duration}ms): ${(err as Error).message}`
      );
      throw err;
    }
  }
}
