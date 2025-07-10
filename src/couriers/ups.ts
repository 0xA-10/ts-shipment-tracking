import { clientCredentialsTokenRequest, DeepPartial, getLocation, reverseOneToManyDictionary } from "./utils";
import { Courier, ParseOptions, TrackingEvent, TrackingStatus } from "../types";
import { parse } from "date-fns";
import { ups } from "ts-tracking-number";
import axios from "axios";
import { randomUUID } from "crypto";

// source: https://developer.ups.com/tag/Tracking?loc=en_US#operation/getSingleTrackResponseUsingGET
type ErrorResponse = {
  response: {
    errors: Array<{
      code: string;
      message: string;
    }>;
  };
};
type SuccessResponse = {
  trackResponse: {
    shipment: Array<{
      package: Array<Shipment>;
      warnings: Array<{
        code: string;
        message: string;
      }>;
    }>;
  };
};
type TrackingResponse = SuccessResponse | ErrorResponse;

type Shipment = {
  activity: Array<ShipmentPackage>;
  deliveryDate: Array<{
    date: string;
    type: string;
  }>;
  deliveryTime: {
    endTime: string;
    startTime: string;
    type: string;
  };
  statusCode: string;
  trackingNumber: string;
};

type ShipmentPackage = DeepPartial<{
  status: {
    description: string;
    type: keyof typeof statusCodes;
  };
  location: {
    address: {
      city: string;
      stateProvince: string;
      countryCode: string;
      postalCode: string;
    };
  };
  date: string;
  time: string;
}>;

// prettier-ignore
const statusCodes = reverseOneToManyDictionary({
  [TrackingStatus.LABEL_CREATED]: [
    'M', 'P',
  ],
  [TrackingStatus.IN_TRANSIT]: [
    'I', 'DO', 'DD', 'W',
  ],
  [TrackingStatus.OUT_FOR_DELIVERY]: [
    'O',
  ],
  [TrackingStatus.RETURNED_TO_SENDER]: [
    'RS',
  ],
  [TrackingStatus.EXCEPTION]: [
    'MV', 'X', 'NA',
  ],
  [TrackingStatus.DELIVERED]: [
    'D',
  ],
} as const);

const getTime = ({ date, time }: { date: string | undefined; time: string | undefined }): number | undefined => {
  if (!date || !time) {
    return;
  }

  const parsedDate = parse(`${date}${time}`, `${`yyyyMMdd`}${`Hmmss`}`, new Date());

  return parsedDate.getTime();
};

const getStatus = (status: ShipmentPackage["status"]): TrackingStatus | undefined => {
  if (!status) {
    return;
  }

  const trackingStatus = (status.type && statusCodes[status.type]) || undefined;

  if (TrackingStatus.EXCEPTION === trackingStatus && status.description?.includes("DELIVERY ATTEMPTED")) {
    return TrackingStatus.DELIVERY_ATTEMPTED;
  }

  return trackingStatus;
};

const getTrackingEvent = ({ date, location, status, time }: ShipmentPackage): TrackingEvent => ({
  status: (status && getStatus(status)) || undefined,
  label: status?.description,
  location: getLocation({
    city: location?.address?.city,
    state: location?.address?.stateProvince,
    country: location?.address?.countryCode,
    zip: location?.address?.postalCode,
  }),
  time: getTime({ date, time }),
});

const getEstimatedDeliveryTime = (shipment: Shipment): number | undefined => {
  if ("EDW" !== shipment.deliveryTime?.type) {
    return;
  }

  const date = shipment.deliveryDate?.[0]?.date;
  const time = shipment.deliveryTime?.endTime;

  return getTime({ date, time });
};

const parseOptions: ParseOptions<TrackingResponse, Shipment> = {
  getShipment: (response) => (response as SuccessResponse).trackResponse?.shipment?.[0]?.package?.[0],

  checkForError: (response) =>
    Boolean(
      (response as ErrorResponse).response?.errors?.[0] ||
        "Tracking Information Not Found" ===
          (response as SuccessResponse).trackResponse?.shipment?.[0]?.warnings?.[0]?.message
    ),

  getTrackingEvents: (shipment) => shipment.activity.map(getTrackingEvent),

  getEstimatedDeliveryTime,
};

const fetchTracking = async (baseURL: string, trackingNumber: string): Promise<TrackingResponse> => {
  const token = await clientCredentialsTokenRequest({
    url: `${baseURL}/security/v1/oauth/token`,

    client_id: process.env.UPS_CLIENT_ID!,
    client_secret: process.env.UPS_CLIENT_SECRET!,
    useAuthorizationHeader: true,
  });

  const { data } = await axios(`${baseURL}/api/track/v1/details/${trackingNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,

      transId: randomUUID(),
      transactionSrc: "ts-shipment-tracking",
    },
  });

  return data;
};

export const UPS: Courier<"UPS", "ups", TrackingResponse, Shipment> = {
  name: "UPS",
  code: "ups",
  requiredEnvVars: ["UPS_CLIENT_ID", "UPS_CLIENT_SECRET"],
  fetchOptions: {
    urls: {
      dev: "https://wwwcie.ups.com",
      prod: "https://onlinetools.ups.com",
    },
    fetchTracking,
  },
  parseOptions,
  tsTrackingNumberCouriers: [ups],
};
