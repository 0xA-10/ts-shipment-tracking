<p align="center">
  <h3 align="center">ts-shipment-tracking</h3>

  <p align="center">
    Unified shipment tracking data from FedEx, UPS, and USPS APIs.
  </p>
</p>

## API Versions

_FedEx:_ Track API 1.0.0 (https://apis.fedex.com/track/v1)

_UPS:_ Track API v1 (https://onlinetools.ups.com/api/track/v1)

_USPS:_ Package Tracking and Notification v3r2 (https://apis.usps.com/tracking/v3r2)

## Installation

```sh
$ npm install ts-shipment-tracking
```

## Quick Start

```ts
import { createTracker } from "ts-shipment-tracking";

const tracker = createTracker({
  providers: { fedex: true, ups: true, usps: true },
  // Rate limiting, retries, and circuit breaker enabled by default
});

const result = await tracker.track("1Z999AA10123456784");
console.log(result.events); // Array of tracking events
```

## Usage

Courier API credentials are stored using dotenv. If you do not have dotenv installed:

```sh
$ npm install dotenv
```

Copy the contents of [.env.template](.env.template) into your `.env` file and fill it out.

Example:

```ts
import "dotenv/config";
import { createTracker, TrackingResult } from "ts-shipment-tracking";

const tracker = createTracker({
  providers: { fedex: true, ups: true, usps: true },
});

(async () => {
  // With automatic courier detection
  try {
    const result: TrackingResult = await tracker.track("<any_tracking_number>");

    console.log(result);
  } catch (err) {
    console.log((err as Error).message);
  }

  // With explicitly specified courier
  try {
    const result: TrackingResult = await tracker.track(
      "<ups_tracking_number>",
      { courierCode: "ups" } // Supports autocomplete!
    );

    console.log(result);
  } catch (err) {
    console.log((err as Error).message);
  }
})();
```

Example output:

```ts
{
  courier: 'fedex',
  trackingNumber: '123456789012',
  events: [
    {
      status: 'IN_TRANSIT',
      label: 'Arrived at FedEx location',
      location: 'LEBANON TN US 37090',
      time: 1616823540000
    },
    // ...
  ],
  estimatedDeliveryTime: 1616996340000,
  raw: { /* original provider response */ }
}
```

## Advanced Features

### Middleware

**Default Middlewares:**

The following middleware is enabled by default for production resilience:

- `rateLimiter` - Per-courier rate limiting (FedEx/USPS: 5 req/sec, UPS: 3 req/sec)
- `retry` - Exponential backoff retry (3 attempts on 429/5xx errors)
- `circuitBreaker` - Prevent cascading failures (opens after 5 failures)

**Opt-Out Example:**

```ts
import { createTracker } from "ts-shipment-tracking";

const tracker = createTracker({
  providers: { fedex: true },
  middlewares: {
    rateLimiter: false, // disable rate limiting
    retry: false, // disable retries
    circuitBreaker: false, // disable circuit breaker
  },
});
```

**Customize Defaults:**

```ts
const tracker = createTracker({
  providers: { fedex: true, ups: true, usps: true },
  middlewares: {
    rateLimiter: {
      limits: {
        fedex: { maxConcurrent: 10, minTime: 100 }, // custom FedEx limit
      },
    },
    retry: { maxAttempts: 5 }, // more aggressive retries
    cache: true, // opt-in to caching
    logger: true, // opt-in to logging
  },
});
```

**Available middleware:**

- `rateLimiter` - Per-courier rate limiting (**enabled by default**)
- `retry` - Exponential backoff retry (**enabled by default**)
- `circuitBreaker` - Prevent cascading failures (**enabled by default**)
- `cache` - Cache results for 5 minutes (opt-in)
- `logger` - Request/response logging (opt-in)

### Batch Tracking

Track multiple shipments at once:

```ts
const results = await tracker.trackBatch([
  { trackingNumber: "1Z999AA10123456784", courierCode: "ups" },
  { trackingNumber: "123456789012" }, // auto-detect
]);

results.forEach(({ trackingNumber, result, error }) => {
  if (result) console.log(`${trackingNumber}: ${result.events[0].status}`);
  if (error) console.error(`${trackingNumber}: ${error.message}`);
});
```

### Event Listeners

Monitor tracking requests with events:

```ts
tracker.on("track:success", ({ trackingNumber, result }) => {
  console.log(`Tracked ${trackingNumber}: ${result.events.length} events`);
});

tracker.on("track:error", ({ trackingNumber, error }) => {
  console.error(`Failed to track ${trackingNumber}:`, error);
});
```

### Custom Configuration

Override defaults for specific providers:

```ts
const tracker = createTracker({
  providers: {
    fedex: {
      url: "https://apis-sandbox.fedex.com", // otherwise gets chosen based on process.env.NODE_ENV
      creds: {
        clientId: "<client-id>", // otherwise uses process.env.FEDEX_CLIENT_ID
        clientSecret: "<client-secret>", // otherwise uses process.env.FEDEX_CLIENT_SECRET
      },
    },
    ups: true, // enabled with defaults
  },
});
```

## API Reference

### TrackingStatus

All possible tracking statuses:

```ts
export enum TrackingStatus {
  LABEL_CREATED = "LABEL_CREATED",
  IN_TRANSIT = "IN_TRANSIT",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERY_ATTEMPTED = "DELIVERY_ATTEMPTED",
  RETURNED_TO_SENDER = "RETURNED_TO_SENDER",
  EXCEPTION = "EXCEPTION",
  DELIVERED = "DELIVERED",
}
```

## OpenAPI Specifications

See [openapi/README.md](./openapi/README.md) for detailed licensing information.

**Important:** By using this library to integrate with carrier APIs, you agree to comply with each carrier's respective API terms of service.

## Acknowledgements

Thanks to @rjbrooksjr's [TS Tracking Number](https://github.com/rjbrooksjr/ts-tracking-number) module being used for tracking number validation and courier detection.

Thanks to @hautelook's [Shipment Tracking](https://github.com/hautelook/shipment-tracking) repo used as a reference for some gaps in courier status codes as well as inspiration for architecture.
