import { ShipmentTracker } from "../tracker";
import { FedExProvider } from "../providers/fedex-provider";
import { UPSProvider } from "../providers/ups-provider";
import { USPSProvider } from "../providers/usps-provider";
import { TrackingInfo, TrackingOptions } from "../types";

let defaultTracker: ShipmentTracker | null = null;

const getTracker = () => {
  if (!defaultTracker) {
    defaultTracker = new ShipmentTracker({
      providers: [new FedExProvider(), new UPSProvider(), new USPSProvider()],
    });
  }
  return defaultTracker;
};

/**
 * @deprecated Use `ShipmentTracker` class instead for v2 API.
 * This function is preserved for backward compatibility.
 */
export const track = async (trackingNumber: string, options?: TrackingOptions): Promise<TrackingInfo> => {
  const tracker = getTracker();
  const result = await tracker.track(trackingNumber, {
    courierCode: options?.courierCode,
  });

  // Return only TrackingInfo shape (v1 API), stripping v2-only fields
  return {
    events: result.events,
    estimatedDeliveryTime: result.estimatedDeliveryTime,
  };
};
