import { EventEmitter } from "events";
import { getTracking } from "ts-tracking-number";
import { BaseProvider } from "./providers/base-provider";
import { FedExProvider, UPSProvider, USPSProvider } from "./providers";
import { Middleware } from "./middleware/types";
import {
  CacheMiddleware,
  RetryMiddleware,
  RateLimiterMiddleware,
  CircuitBreakerMiddleware,
  LoggerMiddleware,
} from "./middleware";
import {
  BatchTrackingItem,
  BatchTrackingResult,
  CreateTrackerOptions,
  MiddlewareContext,
  TrackingResult,
  TrackOptions,
  TrackerOptions,
} from "./types";

export class ShipmentTracker extends EventEmitter {
  private providers = new Map<string, BaseProvider>();
  private middlewares: Middleware[] = [];

  constructor(options?: TrackerOptions) {
    super();
    options?.providers?.forEach((p) => this.use(p));
    options?.middleware?.forEach((m) => this.useMiddleware(m));
  }

  use(provider: BaseProvider): this {
    this.providers.set(provider.code, provider);
    return this;
  }

  useMiddleware(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async track(trackingNumber: string, opts?: TrackOptions): Promise<TrackingResult> {
    const courierCode = opts?.courierCode ?? this.detectCourier(trackingNumber);
    const provider = this.providers.get(courierCode);

    if (!provider) {
      throw new Error(
        `No provider registered for courier code "${courierCode}". ` +
          `Registered providers: ${[...this.providers.keys()].join(", ") || "(none)"}`
      );
    }

    const ctx: MiddlewareContext = {
      trackingNumber,
      courierCode,
      provider,
      options: opts ?? {},
    };

    const execute = (): Promise<TrackingResult> => provider.track(trackingNumber, opts);

    this.emit("track:start", { trackingNumber, courierCode });

    try {
      const result = await this.executeMiddlewareChain(ctx, execute);
      this.emit("track:success", { trackingNumber, courierCode, result });
      return result;
    } catch (err) {
      this.emit("track:error", { trackingNumber, courierCode, error: err });
      throw err;
    }
  }

  async trackBatch(items: BatchTrackingItem[], opts?: TrackOptions): Promise<BatchTrackingResult[]> {
    const results = await Promise.allSettled(
      items.map((item) => this.track(item.trackingNumber, { ...opts, courierCode: item.courierCode }))
    );

    return results.map((result, i) => ({
      trackingNumber: items[i].trackingNumber,
      ...(result.status === "fulfilled"
        ? { result: result.value }
        : { error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)) }),
    }));
  }

  private detectCourier(trackingNumber: string): string {
    const allCouriers = [...this.providers.values()].flatMap((p) => p.tsTrackingNumberCouriers);
    const tracking = getTracking(trackingNumber, allCouriers);

    if (!tracking) {
      const providerNames = [...this.providers.values()].map((p) => p.name);
      throw new Error(
        `"${trackingNumber}" is not a valid tracking number for registered providers. ` +
          `Registered providers: ${providerNames.join(", ") || "(none)"}`
      );
    }

    const detectedCode = tracking.courier.code;

    // Map s10 (universal postal union) codes to the USPS provider
    for (const provider of this.providers.values()) {
      const courierCodes = provider.tsTrackingNumberCouriers.map((c) => c.courier_code);
      if (courierCodes.includes(detectedCode)) {
        return provider.code;
      }
    }

    return detectedCode;
  }

  private async executeMiddlewareChain(
    ctx: MiddlewareContext,
    execute: () => Promise<TrackingResult>
  ): Promise<TrackingResult> {
    if (this.middlewares.length === 0) {
      return execute();
    }

    let index = 0;
    const next = (): Promise<TrackingResult> => {
      if (index >= this.middlewares.length) {
        return execute();
      }
      const middleware = this.middlewares[index++];
      return middleware.execute(ctx, next);
    };

    return next();
  }
}

export function createTracker(options?: CreateTrackerOptions): ShipmentTracker {
  const providers: BaseProvider[] = [];
  const middleware: Middleware[] = [];

  if (options?.providers?.fedex) {
    const config = options.providers.fedex === true ? {} : options.providers.fedex;
    providers.push(new FedExProvider(config));
  }
  if (options?.providers?.ups) {
    const config = options.providers.ups === true ? {} : options.providers.ups;
    providers.push(new UPSProvider(config));
  }
  if (options?.providers?.usps) {
    const config = options.providers.usps === true ? {} : options.providers.usps;
    providers.push(new USPSProvider(config));
  }

  const mwConfig = options?.middlewares ?? {};

  // RateLimiter: ENABLED BY DEFAULT (protects against API rate limits)
  if (mwConfig.rateLimiter !== false) {
    const config = mwConfig.rateLimiter === true || mwConfig.rateLimiter === undefined
      ? {}
      : mwConfig.rateLimiter;
    middleware.push(new RateLimiterMiddleware(config));
  }

  // Retry: ENABLED BY DEFAULT (handles transient failures)
  if (mwConfig.retry !== false) {
    const config = mwConfig.retry === true || mwConfig.retry === undefined
      ? {}
      : mwConfig.retry;
    middleware.push(new RetryMiddleware(config));
  }

  // CircuitBreaker: ENABLED BY DEFAULT (prevents cascading failures)
  if (mwConfig.circuitBreaker !== false) {
    const config = mwConfig.circuitBreaker === true || mwConfig.circuitBreaker === undefined
      ? {}
      : mwConfig.circuitBreaker;
    middleware.push(new CircuitBreakerMiddleware(config));
  }

  // Cache: OPT-IN (not all use cases benefit from caching)
  if (mwConfig.cache) {
    const config = mwConfig.cache === true ? {} : mwConfig.cache;
    middleware.push(new CacheMiddleware(config));
  }

  // Logger: OPT-IN (avoid unwanted console spam)
  if (mwConfig.logger) {
    const config = mwConfig.logger === true ? {} : mwConfig.logger;
    middleware.push(new LoggerMiddleware(config));
  }

  return new ShipmentTracker({
    providers,
    middleware,
  });
}
