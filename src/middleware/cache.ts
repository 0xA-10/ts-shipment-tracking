import { Middleware, NextFunction } from "./types";
import { MiddlewareContext, TrackingResult } from "../types";

export interface CacheAdapter {
  get(key: string): Promise<TrackingResult | undefined>;
  set(key: string, value: TrackingResult, ttlMs: number): Promise<void>;
}

export class MemoryCacheAdapter implements CacheAdapter {
  private cache = new Map<string, { value: TrackingResult; expiresAt: number }>();

  async get(key: string): Promise<TrackingResult | undefined> {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: TrackingResult, ttlMs: number): Promise<void> {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

export type CacheOptions = {
  adapter?: CacheAdapter;
  /** TTL in milliseconds. Default: 5 minutes */
  ttlMs?: number;
};

export class CacheMiddleware implements Middleware {
  private adapter: CacheAdapter;
  private ttlMs: number;

  constructor(options?: CacheOptions) {
    this.adapter = options?.adapter ?? new MemoryCacheAdapter();
    this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000;
  }

  private getCacheKey(ctx: MiddlewareContext): string {
    return `${ctx.courierCode}:${ctx.trackingNumber}`;
  }

  async execute(ctx: MiddlewareContext, next: NextFunction): Promise<TrackingResult> {
    const key = this.getCacheKey(ctx);
    const cached = await this.adapter.get(key);
    if (cached) return cached;

    const result = await next();
    await this.adapter.set(key, result, this.ttlMs);
    return result;
  }
}
