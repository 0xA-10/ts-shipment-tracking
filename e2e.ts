import "dotenv/config";
import { track, ShipmentTracker, FedExProvider, UPSProvider, USPSProvider } from "./src";

const { log } = console;

const providers = [
  { name: "FedEx", code: "fedex", provider: new FedExProvider() },
  { name: "UPS", code: "ups", provider: new UPSProvider() },
  { name: "USPS", code: "usps", provider: new USPSProvider() },
];

/**
 * A script that logs the results of sequentially testing tracking for each courier
 * using both the v2 (ShipmentTracker) and legacy (track()) APIs.
 *
 * For each courier, environment variable `TEST_{COURIERNAMEUPPERCASENOUNDERSCORE}_TRACKING_NUMBER`
 * must be set in order to test a respective courier's tracking.
 * e.g. TEST_FEDEX_TRACKING_NUMBER=000000000000000
 */
const test = async () => {
  const tracker = new ShipmentTracker({ providers: providers.map((p) => p.provider) });

  log("=== v2 API (ShipmentTracker) ===\n");

  for (const [index, { name, code }] of providers.entries()) {
    const envVarName = `TEST_${name.toUpperCase()}_TRACKING_NUMBER`;
    const trackingNumber = process.env[envVarName];

    if (index > 0) {
      log("---");
    }

    log(`${name}:`);

    if (!trackingNumber) {
      log(`Please set environment variable "${envVarName}" in order to test ${name} tracking.`);
      continue;
    }

    try {
      const result = await tracker.track(trackingNumber, { courierCode: code });
      const [mostRecentEvent] = result.events;

      log(mostRecentEvent);
      log(`Courier: ${result.courier}, Tracking: ${result.trackingNumber}`);

      if (result.estimatedDeliveryTime) {
        log(`Estimated delivery time: ${new Date(result.estimatedDeliveryTime)}`);
      }
    } catch (err) {
      const error = err as Error;
      log(`Error tracking ${name} tracking number ${trackingNumber}:`);
      log();
      log(`   ${error.stack ? error.stack : error.message}`);
    }
  }

  log("\n=== Legacy API (track()) ===\n");

  for (const [index, { name, code }] of providers.entries()) {
    const envVarName = `TEST_${name.toUpperCase()}_TRACKING_NUMBER`;
    const trackingNumber = process.env[envVarName];

    if (index > 0) {
      log("---");
    }

    log(`${name}:`);

    if (!trackingNumber) {
      log(`Please set environment variable "${envVarName}" in order to test ${name} tracking.`);
      continue;
    }

    try {
      const {
        events: [mostRecentEvent],
        estimatedDeliveryTime,
      } = await track(trackingNumber, { courierCode: code });

      log(mostRecentEvent);

      if (estimatedDeliveryTime) {
        log(`Estimated delivery time: ${new Date(estimatedDeliveryTime)}`);
      }
    } catch (err) {
      const error = err as Error;
      log(`Error tracking ${name} tracking number ${trackingNumber}:`);
      log();
      log(`   ${error.stack ? error.stack : error.message}`);
    }
  }
};

test();
