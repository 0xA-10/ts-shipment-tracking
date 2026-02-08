// v2 API
export { ShipmentTracker, createTracker } from "./tracker";
export { BaseProvider } from "./providers/base-provider";
export type { OAuthConfig, ProviderConfig, BaseProviderOptions } from "./providers/base-provider";
export { FedExProvider, UPSProvider, USPSProvider } from "./providers";
export type { FedExProviderOptions, FedExUrl } from "./providers/fedex-provider";
export type { UPSProviderOptions, UPSUrl } from "./providers/ups-provider";
export type { USPSProviderOptions, USPSUrl } from "./providers/usps-provider";

// Middleware
export type { Middleware, NextFunction } from "./middleware/types";
export {
  RateLimiterMiddleware,
  CacheMiddleware,
  MemoryCacheAdapter,
  RetryMiddleware,
  CircuitBreakerMiddleware,
  LoggerMiddleware,
} from "./middleware";
export type {
  CacheAdapter,
  CacheOptions,
  RateLimiterOptions,
  RetryOptions,
  CircuitBreakerOptions,
  LoggerOptions,
} from "./middleware";

// Errors
export { TrackingError, ProviderError, AuthenticationError } from "./errors";

// Types
export {
  TrackingStatus,
  type TrackingEvent,
  type TrackingInfo,
  type TrackingResult,
  type TrackOptions,
  type BatchTrackingItem,
  type BatchTrackingResult,
  type TrackerOptions,
  type CreateTrackerOptions,
  type MiddlewareContext,
  type ProviderCredentials,
} from "./types";

// Legacy (deprecated) — backward compatibility
export { track } from "./legacy";
export type { TrackingOptions, FetchOptions, ParseOptions, Courier, Couriers } from "./types";
