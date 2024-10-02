import {
  clientCredentialsTokenRequest,
  DeepPartial,
  getLocation,
  reverseOneToManyDictionary,
} from "./utils";
import { Courier, ParseOptions, TrackingEvent, TrackingStatus } from "../types";
import { s10, usps } from "ts-tracking-number";
import axios from "axios";

// prettier-ignore
const statusCodes = reverseOneToManyDictionary({
  [TrackingStatus.LABEL_CREATED]: [
    'MA', 'GX',
  ],
  [TrackingStatus.OUT_FOR_DELIVERY]: [
    '59', 'DG', 'OF',
  ],
  [TrackingStatus.DELIVERY_ATTEMPTED]: [
    '02', '52', '51', '53', '54', '55', '56', '57', 'CA', 'CM',
    'H0', 'NH',
  ],
  [TrackingStatus.RETURNED_TO_SENDER]: [
    '09', '28', '29', '31', 'H8', '04', 'RD', 'RE', '05', '21',
    '22', '23', '24', '25', '26', '27', 'BA', 'K4', 'K5', 'K6',
    'K7', 'RT',
  ],
  [TrackingStatus.DELIVERED]: [
    '01', 'I0', 'BR', 'DN', 'AH', 'DL', 'OK', '60', '17',
  ],
} as const);

type TrackInfo = DeepPartial<{
  name: string;
  eventCode: keyof typeof statusCodes;
  eventCity: string;
  eventState: string;
  eventCountry: string;
  eventZIP: string;
  EventDate: string;
  GMTTimestamp: string;
}>;

const getTrackingEvent = ({
  name,
  eventCode,
  eventCity,
  eventState,
  eventZIP,
  eventCountry,
  GMTTimestamp,
}: TrackInfo): TrackingEvent => ({
  status:
    (eventCode ? statusCodes[eventCode] : TrackingStatus.IN_TRANSIT) ||
    undefined,
  label: name,
  location: getLocation({
    city: eventCity,
    state: eventState,
    country: eventCountry,
    zip: eventZIP,
  }),
  time: GMTTimestamp ? Date.parse(GMTTimestamp) : undefined,
});

const parseOptions: ParseOptions = {
  getShipment: (response) => response,

  checkForError: (response) => response.error,

  getTrackingEvents: (shipment) =>
    shipment.eventSummaries.map(getTrackingEvent),

  getEstimatedDeliveryTime: (shipment) =>
    Date.parse(shipment.expectedDeliveryTimeStamp),
};

const fetchTracking = async (baseURL: string, trackingNumber: string) => {
  const token = await clientCredentialsTokenRequest({
    url: `${baseURL}/oauth2/v3/token`,

    client_id: process.env.USPS_DEV_CLIENT_ID!,
    client_secret: process.env.USPS_DEV_CLIENT_SECRET!,
    scope: "tracking",
  });

  const { data } = await axios(
    `${baseURL}/tracking/v3/tracking/${trackingNumber}?expand=DETAIL`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return data;
};

export const USPS: Courier<"USPS", "usps"> = {
  name: "USPS",
  code: "usps",
  requiredEnvVars: [
    "USPS_DEV_CLIENT_ID",
    "USPS_DEV_CLIENT_SECRET",
    "USPS_PROD_CLIENT_ID",
    "USPS_PROD_CLIENT_SECRET",
  ],
  fetchOptions: {
    urls: {
      dev: "https://api-cat.usps.com",
      prod: "https://api.usps.com",
    },
    fetchTracking,
  },
  parseOptions,
  tsTrackingNumberCouriers: [s10, usps],
};
