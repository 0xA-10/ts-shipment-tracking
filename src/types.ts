import { TrackingCourier } from "ts-tracking-number";
import type { BaseProvider } from "./providers/base-provider";
import type { FedExProviderOptions } from "./providers/fedex-provider";
import type { UPSProviderOptions } from "./providers/ups-provider";
import type { USPSProviderOptions } from "./providers/usps-provider";
import type { Middleware } from "./middleware/types";
import type { CacheOptions } from "./middleware/cache";
import type { RetryOptions } from "./middleware/retry";
import type { RateLimiterOptions } from "./middleware/rate-limiter";
import type { CircuitBreakerOptions } from "./middleware/circuit-breaker";
import type { LoggerOptions } from "./middleware/logger";

// ─── v2 Types ────────────────────────────────────────────

// ─── Provider Credentials ────────────────────────────────

export type ProviderCredentials = {
  /** Defaults to process.env.${PROVIDER}_CLIENT_ID */
  clientId: string;
  /** Defaults to process.env.${PROVIDER}_CLIENT_SECRET */
  clientSecret: string;
};

// ─── Tracking Types ──────────────────────────────────────

export enum TrackingStatus {
  LABEL_CREATED = "LABEL_CREATED",
  IN_TRANSIT = "IN_TRANSIT",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERY_ATTEMPTED = "DELIVERY_ATTEMPTED",
  RETURNED_TO_SENDER = "RETURNED_TO_SENDER",
  EXCEPTION = "EXCEPTION",
  DELIVERED = "DELIVERED",
}

export type TrackingEvent = {
  /**
   * Previously contained status 'UNAVAILABLE', this status has been removed in favor of `undefined`
   */
  status?: TrackingStatus;

  label?: string;

  location?: string;

  /**
   * Previously named `date`
   */
  time?: number;
};

export type TrackingInfo = {
  events: TrackingEvent[];

  /**
   * Previously named `estimatedDeliveryDate`
   */
  estimatedDeliveryTime?: number;
};

export type TrackingResult = TrackingInfo & {
  courier: string;
  trackingNumber: string;
  raw: unknown;
};

export type TrackOptions = {
  /**
   * Explicitly define a courier code to bypass auto-detection
   */
  courierCode?: string;
};

export type BatchTrackingItem = {
  trackingNumber: string;
  courierCode?: string;
};

export type BatchTrackingResult = {
  trackingNumber: string;
  result?: TrackingResult;
  error?: Error;
};

export type TrackerOptions = {
  providers?: BaseProvider[];
  middleware?: Middleware[];
};

export type CreateTrackerOptions = {
  providers?: {
    fedex?: true | FedExProviderOptions;
    ups?: true | UPSProviderOptions;
    usps?: true | USPSProviderOptions;
  };
  middlewares?: {
    cache?: false | true | CacheOptions;
    retry?: false | true | RetryOptions;
    rateLimiter?: false | true | RateLimiterOptions;
    circuitBreaker?: false | true | CircuitBreakerOptions;
    logger?: false | true | LoggerOptions;
  };
};

// ─── Middleware Context ──────────────────────────────────

export type MiddlewareContext = {
  trackingNumber: string;
  courierCode: string;
  provider: BaseProvider;
  options: TrackOptions;
};

// ─── Legacy Types (deprecated) ───────────────────────────

/**
 * @deprecated Use `TrackOptions` instead
 */
export type TrackingOptions = {
  /**
   * Explicitly define a courier code to bypass auto-detection
   */
  courierCode?: string;

  /**
   * By default, `process.env.NODE_ENV` is used to determine whether to use courier's dev or prod env.
   * Explicitly define an environment to override this.
   */
  env?: "development" | "production";
};

/**
 * @deprecated Use provider classes directly instead
 */
export type FetchOptions<TrackingResponse> = {
  urls: {
    dev: string;
    prod: string;
  };

  fetchTracking: (url: string, trackingNumber: string) => Promise<TrackingResponse>;
};

/**
 * @deprecated Use provider classes directly instead
 */
export type ParseOptions<TrackingResponse, Shipment> = {
  /**
   * Retrieves the item which represents the shipment from the tracking response.
   */
  getShipment: (response: TrackingResponse) => Shipment;

  /**
   * A function which returns true if an error is detected in either the entire json response
   * or the shipment item (convenience).
   */
  checkForError: (response: TrackingResponse, shipment: Shipment) => boolean;

  getTrackingEvents: (shipment: Shipment) => TrackingEvent[];

  getEstimatedDeliveryTime?: (shipment: Shipment) => TrackingInfo["estimatedDeliveryTime"];
};

/**
 * @deprecated Use provider classes directly instead
 */
export type Courier<Name, Code, TrackingResponse, Shipment> = {
  name: Name;

  code: Code;

  requiredEnvVars?: string[];

  fetchOptions: FetchOptions<TrackingResponse>;

  parseOptions: ParseOptions<TrackingResponse, Shipment>;

  tsTrackingNumberCouriers: readonly TrackingCourier[];
};

/**
 * @deprecated Internal type from v1
 */
export type Couriers = Record<string, Courier<string, string, unknown, unknown>>;
