import { BaseProvider, BaseProviderOptions, OAuthConfig } from "./base-provider";
import { DeepPartial, getLocation, reverseOneToManyDictionary } from "./utils";
import { TrackingEvent, TrackingStatus } from "../types";
import { ProviderError } from "../errors";
import { s10, usps } from "ts-tracking-number";
import axios from "axios";
import type { components } from "./generated/usps";

// ─── USPS Provider Types ──────────────────────────────────

export type USPSUrl =
  | "https://apis-tem.usps.com/tracking/v3r2"
  | "https://apis.usps.com/tracking/v3r2"
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

// ─── Generated API Types ──────────────────────────────────
// source: https://developers.usps.com/trackingv3r2
// Using POST /tracking endpoint (v3r2) for comprehensive tracking data

type ErrorResponse = components["schemas"]["ErrorMessage"];
type SuccessResponse = components["schemas"]["TrackingDetails"]; // Array of TrackingDetail
type MultiStatusResponse = components["schemas"]["MultiStatusResponse"];
type TrackingResponse = SuccessResponse | ErrorResponse | MultiStatusResponse;

// Map generated types to existing internal names for backward compatibility
type USPSTrackingDetail = components["schemas"]["TrackingDetail"];
type USPSTrackingEvent = components["schemas"]["TrackingEvent"];

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
        dev: "https://apis-tem.usps.com/tracking/v3r2",
        prod: "https://apis.usps.com/tracking/v3r2",
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
    const requestBody: components["schemas"]["TrackingRequest"] = [
      {
        trackingNumber: trackingNumber,
      },
    ];

    const { data } = await axios(`${baseUrl}/tracking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: JSON.stringify(requestBody),
      timeout: this.config.timeout,
    });

    return data;
  }

  protected checkForError(raw: unknown): void {
    const response = raw as TrackingResponse;

    // Check for top-level error response
    if ((response as ErrorResponse).error) {
      throw new ProviderError(
        `Error found in USPS tracking response: ${JSON.stringify(response)}`,
        { courier: this.name, trackingNumber: "", raw }
      );
    }

    // Check for MultiStatusResponse with embedded errors
    if (Array.isArray(response)) {
      const multiStatus = response as MultiStatusResponse;
      const hasError = multiStatus.some((item) => "statusCode" in item && item.statusCode !== "200");

      if (hasError) {
        const errorItem = multiStatus.find((item) => "statusCode" in item && item.statusCode !== "200");
        throw new ProviderError(
          `Error found in USPS tracking response: ${JSON.stringify(errorItem)}`,
          { courier: this.name, trackingNumber: "", raw }
        );
      }
    }
  }

  protected parseResponse(raw: unknown): { events: TrackingEvent[]; estimatedDeliveryTime?: number } {
    const response = raw as SuccessResponse;

    // Extract first tracking detail from array response
    const trackingDetail: USPSTrackingDetail | undefined = Array.isArray(response) ? response[0] : undefined;

    if (!trackingDetail) {
      throw new ProviderError(`Could not find tracking detail in USPS response: ${JSON.stringify(raw)}`, {
        courier: this.name,
        trackingNumber: "",
        raw,
      });
    }

    // Map new event structure to format expected by getTrackingEvent
    const events = (trackingDetail.trackingEvents || []).map((event: USPSTrackingEvent) =>
      getTrackingEvent({
        eventType: event.eventType,
        eventCode: event.eventCode as keyof typeof statusCodes,
        eventCity: event.eventCity,
        eventState: event.eventState,
        eventCountry: event.eventCountry,
        eventZIP: event.eventZIPCode, // Note: field name changed from eventZIP to eventZIPCode
        eventTimestamp: event.eventTimestamp,
      })
    );

    // Map delivery date fields (priority order: expected > predicted > guaranteed)
    const estimatedDeliveryTime =
      (trackingDetail.deliveryDateExpectation?.expectedDeliveryDate
        ? Date.parse(trackingDetail.deliveryDateExpectation.expectedDeliveryDate)
        : undefined) ||
      (trackingDetail.deliveryDateExpectation?.predictedDeliveryDate
        ? Date.parse(trackingDetail.deliveryDateExpectation.predictedDeliveryDate)
        : undefined) ||
      (trackingDetail.deliveryDateExpectation?.guaranteedDeliveryDate
        ? Date.parse(
            typeof trackingDetail.deliveryDateExpectation.guaranteedDeliveryDate === "string"
              ? trackingDetail.deliveryDateExpectation.guaranteedDeliveryDate
              : ""
          )
        : undefined);

    return { events, estimatedDeliveryTime };
  }
}
