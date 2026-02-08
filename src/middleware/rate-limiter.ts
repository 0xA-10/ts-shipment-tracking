import Bottleneck from "bottleneck";
import { Middleware, NextFunction } from "./types";
import { MiddlewareContext, TrackingResult } from "../types";

export type RateLimiterOptions = {
  /** Per-courier rate limit settings. Key is the courier code. */
  limits?: Record<string, Bottleneck.ConstructorOptions>;
};

const DEFAULT_LIMITS: Record<string, Bottleneck.ConstructorOptions> = {
  fedex: { maxConcurrent: 5, minTime: 200 },
  ups: { maxConcurrent: 3, minTime: 333 },
  usps: { maxConcurrent: 5, minTime: 200 },
};

export class RateLimiterMiddleware implements Middleware {
  private limiters = new Map<string, Bottleneck>();
  private options: RateLimiterOptions;

  constructor(options?: RateLimiterOptions) {
    this.options = options ?? {};
  }

  private getLimiter(courierCode: string): Bottleneck {
    let limiter = this.limiters.get(courierCode);
    if (!limiter) {
      const config = this.options.limits?.[courierCode] ?? DEFAULT_LIMITS[courierCode] ?? { maxConcurrent: 5, minTime: 200 };
      limiter = new Bottleneck(config);
      this.limiters.set(courierCode, limiter);
    }
    return limiter;
  }

  async execute(ctx: MiddlewareContext, next: NextFunction): Promise<TrackingResult> {
    const limiter = this.getLimiter(ctx.courierCode);
    return limiter.schedule(() => next());
  }
}
