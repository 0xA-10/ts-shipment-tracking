import { BaseProvider, BaseProviderOptions, OAuthConfig } from "./base-provider";
import { DeepPartial, getLocation, reverseOneToManyDictionary } from "./utils";
import { TrackingEvent, TrackingStatus } from "../types";
import { ProviderError } from "../errors";
import { fedex } from "ts-tracking-number";
import axios from "axios";

// ─── FedEx Provider Types ─────────────────────────────────

export type FedExUrl =
  | "https://apis-sandbox.fedex.com"
  | "https://apis.fedex.com"
  | (string & {});

export type FedExProviderOptions = BaseProviderOptions & {
  /**
   * FedEx API URL. Defaults to sandbox or production based on `NODE_ENV`.
   */
  url?: FedExUrl;
  /**
   * OAuth scope override.
   */
  scope?: string;
};

// source: https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html#operation/Track%20by%20Tracking%20Number
type ErrorResponse = {
  errors: [
    {
      code: string;
      message: string;
    }
  ];
};
type SuccessResponse = {
  output: {
    completeTrackResults: Array<{
      trackingNumber: string;
      trackResults: Array<Shipment>;
    }>;
  };
};
type TrackingResponse = SuccessResponse | ErrorResponse;

type Shipment = {
  scanEvents: Array<TrackDetails>;
  estimatedDeliveryTimeWindow: {
    window: {
      begins: string;
      ends: string;
    };
    type: string;
  };
  standardTransitTimeWindow: {
    window: {
      begins: string;
      ends: string;
    };
    type: string;
  };
};

type TrackDetails = DeepPartial<{
  eventType: keyof typeof statusCodes;
  eventDescription: string;
  scanLocation: {
    city: string;
    stateOrProvinceCode: string;
    countryCode: string;
    postalCode: string;
  };
  date: string;
}>;

// prettier-ignore
const statusCodes = reverseOneToManyDictionary({
  [TrackingStatus.LABEL_CREATED]: [
    'OC',
  ],
  [TrackingStatus.IN_TRANSIT]: [
    'AA', 'AC', 'AD', 'AF', 'AP', 'AR', 'AX', 'DP', 'DR', 'DS',
    'EA', 'ED', 'EO', 'EP', 'FD', 'HL', 'IT', 'LO', 'PF', 'PL',
    'PM', 'SF', 'SP', 'TR', 'CC', 'CP', 'OF', 'OX', 'SH', 'CU',
    'BR', 'TP', 'PU', 'HP',
  ],
  [TrackingStatus.OUT_FOR_DELIVERY]: [
    'OD',
  ],
  [TrackingStatus.RETURNED_TO_SENDER]: [
    'RS', 'RP', 'LP', 'RG', 'RD',
  ],
  [TrackingStatus.EXCEPTION]: [
    'CA', 'DE', 'SE', 'PX', 'CH', 'DD', 'DY', 'IX', 'PD', 'CD',
    'RR', 'RM', 'RC',
  ],
  [TrackingStatus.DELIVERED]: [
    'DL',
  ],
} as const);

const getTrackingEvent = ({ scanLocation, eventDescription, eventType, date }: TrackDetails): TrackingEvent => ({
  status: (eventType && statusCodes[eventType]) || undefined,
  label: eventDescription,
  location: getLocation({
    city: scanLocation?.city,
    state: scanLocation?.stateOrProvinceCode,
    country: scanLocation?.countryCode,
    zip: scanLocation?.postalCode,
  }),
  time: date ? Date.parse(date) : undefined,
});

export class FedExProvider extends BaseProvider {
  readonly name = "FedEx";
  readonly code = "fedex";
  readonly tsTrackingNumberCouriers = [fedex] as const;

  constructor(config?: FedExProviderOptions) {
    super({
      url: config?.url,
      creds: config?.creds,
      timeout: config?.timeout,
      scope: config?.scope,
      defaultUrls: {
        dev: "https://apis-sandbox.fedex.com",
        prod: "https://apis.fedex.com",
      },
      envVars: {
        clientId: "FEDEX_CLIENT_ID",
        clientSecret: "FEDEX_CLIENT_SECRET",
      },
    });
  }

  protected getOAuthConfig(baseUrl: string): OAuthConfig {
    const creds = this.getCreds();
    return {
      tokenUrl: `${baseUrl}/oauth/token`,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      scope: this.config.scope,
    };
  }

  protected async fetchTrackingData(baseUrl: string, trackingNumber: string, token: string): Promise<TrackingResponse> {
    const { data } = await axios(`${baseUrl}/track/v1/trackingnumbers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: JSON.stringify({
        includeDetailedScans: true,
        trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
      }),
      timeout: this.config.timeout,
    });

    return data;
  }

  protected checkForError(raw: unknown): void {
    const response = raw as TrackingResponse;
    if ((response as ErrorResponse).errors) {
      throw new ProviderError(
        `Error found in FedEx tracking response: ${JSON.stringify(response)}`,
        { courier: this.name, trackingNumber: "", raw }
      );
    }

    // Check for per-tracking-number errors within successful response
    const successResponse = response as SuccessResponse;
    const trackResult = successResponse.output?.completeTrackResults?.[0]?.trackResults?.[0];
    if (trackResult && "error" in trackResult) {
      throw new ProviderError(
        `Error found in FedEx tracking result: ${JSON.stringify(trackResult)}`,
        { courier: this.name, trackingNumber: "", raw }
      );
    }
  }

  protected parseResponse(raw: unknown): { events: TrackingEvent[]; estimatedDeliveryTime?: number } {
    const response = raw as SuccessResponse;
    const shipment = response.output.completeTrackResults[0].trackResults[0];

    const events = shipment.scanEvents.map(getTrackingEvent);

    let estimatedDeliveryTime: number | undefined;
    if (shipment.estimatedDeliveryTimeWindow?.type === "ESTIMATED_DELIVERY") {
      estimatedDeliveryTime = Date.parse(shipment.estimatedDeliveryTimeWindow.window.begins);
    } else if (shipment.standardTransitTimeWindow?.type === "ESTIMATED_DELIVERY") {
      estimatedDeliveryTime = Date.parse(shipment.standardTransitTimeWindow.window.begins);
    }

    return { events, estimatedDeliveryTime };
  }
}
