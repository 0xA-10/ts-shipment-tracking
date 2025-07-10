import { getTracking } from "ts-tracking-number";
import * as couriers from "./couriers";
import { Couriers, FetchOptions, TrackingOptions } from "./types";

// A map of courier definitions keyed by their code
export const courierCodeMap = Object.values(couriers).reduce(
  (map, courier) => ({ ...map, [courier.code]: courier }),
  // Initialize the map to use USPS tracking for S10 codes
  { s10: couriers.USPS } as { s10: typeof couriers.USPS } & {
    [Key in keyof Couriers as Couriers[Key]["code"]]: Couriers[Key];
  }
);

const supportedCouriers = Object.values(couriers).flatMap(({ tsTrackingNumberCouriers }) => tsTrackingNumberCouriers);

export const getCourierCode = (trackingNumber: string) => {
  const tracking = getTracking(trackingNumber, supportedCouriers);

  if (!tracking) {
    const supportedCourierNames = Object.values(couriers).map(({ name }) => name);
    throw new Error(
      `"${trackingNumber}" is not a valid tracking number for supported couriers. Supported couriers are ${supportedCourierNames}.`
    );
  }

  return tracking.courier.code;
};

export function assertValidCode(value: string | undefined): asserts value is keyof typeof courierCodeMap {
  if (value == null || !(value in courierCodeMap)) {
    throw new Error(`"${value}" is not a valid courier code. Valid courier codes are ${Object.keys(courierCodeMap)}`);
  }
}

export const getEnvUrl = <TrackingResponse>({
  urls,
  explicitEnv,
}: {
  urls: FetchOptions<TrackingResponse>["urls"];
  explicitEnv?: TrackingOptions["env"];
}) => {
  if (explicitEnv) {
    return explicitEnv === "production" ? urls.prod : urls.dev;
  }

  return process.env.NODE_ENV === "production" ? urls.prod : urls.dev;
};
