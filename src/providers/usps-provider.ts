import { BaseProvider, BaseProviderOptions, OAuthConfig } from "./base-provider";
import { DeepPartial, getLocation, reverseOneToManyDictionary } from "./utils";
import { TrackingEvent, TrackingStatus } from "../types";
import { ProviderError } from "../errors";
import { s10, usps } from "ts-tracking-number";
import axios from "axios";

// ─── USPS Provider Types ──────────────────────────────────

export type USPSUrl =
  | "https://api-cat.usps.com"
  | "https://api.usps.com"
  | (string & {});

export type USPSProviderOptions = BaseProviderOptions & {
  /**
   * USPS API URL. Defaults to sandbox or production based on `NODE_ENV`.
   */
  url?: USPSUrl;
  /**
   * OAuth scope override. Defaults to "tracking".
   */
  scope?: string;
};

// source: https://developers.usps.com/trackingv3r2
type ErrorResponse = {
  error: {
    code: string;
    message: string;
    errors: Array<{
      status: string;
      code: string;
      title: string;
      detail: string;
    }>;
  };
};
type SuccessResponse = Shipment;
type TrackingResponse = SuccessResponse | ErrorResponse;

type Shipment = {
  trackingNumber: string;
  expectedDeliveryTimeStamp: string;
  trackingEvents: Array<{
    eventType: string;
    eventCode: keyof typeof statusCodes;
    eventCity: string;
    eventState: string;
    eventCountry: string;
    eventZIP: string;
    eventTimestamp: string;
  }>;
};

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
    'H0', 'NH', '31',
  ],
  [TrackingStatus.RETURNED_TO_SENDER]: [
    '09', '28', '29', 'H8', '04', 'RD', 'RE', '05', '21',
    '22', '23', '24', '25', '26', '27', 'BA', 'K4', 'K5', 'K6',
    'K7', 'RT', '17',
  ],
  [TrackingStatus.DELIVERED]: [
    '01', 'I0', 'BR', 'DN', 'AH', 'DL', 'OK',
  ],
  [TrackingStatus.IN_TRANSIT]: [
    '60',
  ],
} as const);

type TrackInfo = DeepPartial<{
  eventType: string;
  eventCode: keyof typeof statusCodes;
  eventCity: string;
  eventState: string;
  eventCountry: string;
  eventZIP: string;
  eventTimestamp: string;
}>;

const getTrackingEvent = ({
  eventType,
  eventCode,
  eventCity,
  eventState,
  eventZIP,
  eventCountry,
  eventTimestamp,
}: TrackInfo): TrackingEvent => ({
  status: (eventCode ? statusCodes[eventCode] : TrackingStatus.IN_TRANSIT) || undefined,
  label: eventType,
  location: getLocation({
    city: eventCity,
    state: eventState,
    country: eventCountry,
    zip: eventZIP,
  }),
  time: eventTimestamp ? Date.parse(eventTimestamp) : undefined,
});

export class USPSProvider extends BaseProvider {
  readonly name = "USPS";
  readonly code = "usps";
  readonly tsTrackingNumberCouriers = [s10, usps] as const;

  constructor(config?: USPSProviderOptions) {
    super({
      url: config?.url,
      creds: config?.creds,
      timeout: config?.timeout,
      scope: config?.scope ?? "tracking",
      defaultUrls: {
        dev: "https://api-cat.usps.com",
        prod: "https://api.usps.com",
      },
      envVars: {
        clientId: "USPS_CLIENT_ID",
        clientSecret: "USPS_CLIENT_SECRET",
      },
    });
  }

  protected getOAuthConfig(baseUrl: string): OAuthConfig {
    const creds = this.getCreds();
    return {
      tokenUrl: `${baseUrl}/oauth2/v3/token`,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      scope: this.config.scope,
    };
  }

  protected async fetchTrackingData(baseUrl: string, trackingNumber: string, token: string): Promise<TrackingResponse> {
    const { data } = await axios(`${baseUrl}/tracking/v3/tracking/${trackingNumber}?expand=DETAIL`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: this.config.timeout,
    });

    return data;
  }

  protected checkForError(raw: unknown): void {
    const response = raw as TrackingResponse;
    if ((response as ErrorResponse).error) {
      throw new ProviderError(
        `Error found in USPS tracking response: ${JSON.stringify(response)}`,
        { courier: this.name, trackingNumber: "", raw }
      );
    }
  }

  protected parseResponse(raw: unknown): { events: TrackingEvent[]; estimatedDeliveryTime?: number } {
    const shipment = raw as Shipment;

    const events = shipment.trackingEvents.map(getTrackingEvent);
    const estimatedDeliveryTime = shipment.expectedDeliveryTimeStamp
      ? Date.parse(shipment.expectedDeliveryTimeStamp)
      : undefined;

    return { events, estimatedDeliveryTime };
  }
}
