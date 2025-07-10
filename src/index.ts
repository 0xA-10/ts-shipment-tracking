import { AxiosError } from "axios";
import { Courier, TrackingInfo, TrackingOptions } from "./types";
import { assertValidCode, courierCodeMap, getCourierCode, getEnvUrl } from "./utils";

export * from "./types";

const parseTrackInfo = <CourierName, CourierCode, Response, Shipment>(
  response: Response,
  { name: courierName, parseOptions }: Courier<CourierName, CourierCode, Response, Shipment>
): TrackingInfo => {
  const shipment = parseOptions.getShipment(response);

  if (parseOptions.checkForError(response, shipment)) {
    throw new Error(
      `Error found in the following ${courierName} tracking response:

    ${JSON.stringify(response)}
`
    );
  }

  if (shipment == null) {
    throw new Error(
      `"getShipment" function ${parseOptions.getShipment.toString()} could not find the shipment in the following ${courierName} tracking response:
    
    ${JSON.stringify(response)}
`
    );
  }

  const events = parseOptions.getTrackingEvents(shipment);
  const estimatedDeliveryTime = parseOptions.getEstimatedDeliveryTime?.(shipment);

  return {
    events,
    estimatedDeliveryTime,
  };
};

const trackForCourier = async <CourierName, CourierCode>(
  courier: Courier<CourierName, CourierCode, any, any>,
  trackingNumber: string,
  options?: TrackingOptions
): Promise<TrackingInfo> => {
  /**
   * Ensure credentials are present
   */
  courier.requiredEnvVars?.forEach((v) => {
    if (!process.env[v]) {
      throw new Error(`Environment variable "${v}" must be set in order to use ${courier.name} tracking.`);
    }
  });

  const { fetchTracking, urls } = courier.fetchOptions;
  const url = getEnvUrl({ urls, explicitEnv: options?.env });

  try {
    const response = await fetchTracking(url, trackingNumber);

    return parseTrackInfo(response, courier);
  } catch (err) {
    /**
     * Unwrap Axios response error data
     */
    if ((err as AxiosError).response?.data) {
      throw Error(JSON.stringify((err as AxiosError).response!.data));
    }

    throw err;
  }
};

export const track = async (trackingNumber: string, options?: TrackingOptions): Promise<TrackingInfo> => {
  const courierCode = options?.courierCode ?? getCourierCode(trackingNumber);

  assertValidCode(courierCode);

  const courier = courierCodeMap[courierCode];
  const trackingInfo = await trackForCourier(courier, trackingNumber, options);

  return trackingInfo;
};
