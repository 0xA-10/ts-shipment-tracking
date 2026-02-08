import { BaseProvider, BaseProviderOptions, OAuthConfig } from "./base-provider";
import { DeepPartial, getLocation, reverseOneToManyDictionary } from "./utils";
import { TrackingEvent, TrackingStatus } from "../types";
import { ProviderError } from "../errors";
import { parse } from "date-fns";
import { ups } from "ts-tracking-number";
import { randomUUID } from "crypto";
import axios from "axios";

// ─── UPS Provider Types ───────────────────────────────────

export type UPSUrl =
  | "https://wwwcie.ups.com"
  | "https://onlinetools.ups.com"
  | (string & {});

export type UPSProviderOptions = BaseProviderOptions & {
  /**
   * UPS API URL. Defaults to sandbox or production based on `NODE_ENV`.
   */
  url?: UPSUrl;
  /**
   * OAuth scope override.
   */
  scope?: string;
};

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

  const parsedDate = parse(`${date}${time}`, `${`yyyyMMdd`}${`HHmmss`}`, new Date());

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

export class UPSProvider extends BaseProvider {
  readonly name = "UPS";
  readonly code = "ups";
  readonly tsTrackingNumberCouriers = [ups] as const;

  constructor(config?: UPSProviderOptions) {
    super({
      url: config?.url,
      creds: config?.creds,
      timeout: config?.timeout,
      scope: config?.scope,
      defaultUrls: {
        dev: "https://wwwcie.ups.com",
        prod: "https://onlinetools.ups.com",
      },
      envVars: {
        clientId: "UPS_CLIENT_ID",
        clientSecret: "UPS_CLIENT_SECRET",
      },
    });
  }

  protected getOAuthConfig(baseUrl: string): OAuthConfig {
    const creds = this.getCreds();
    return {
      tokenUrl: `${baseUrl}/security/v1/oauth/token`,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      scope: this.config.scope,
      useAuthorizationHeader: true,
    };
  }

  protected async fetchTrackingData(baseUrl: string, trackingNumber: string, token: string): Promise<TrackingResponse> {
    const { data } = await axios(`${baseUrl}/api/track/v1/details/${trackingNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        transId: randomUUID(),
        transactionSrc: "ts-shipment-tracking",
      },
      timeout: this.config.timeout,
    });

    return data;
  }

  protected checkForError(raw: unknown): void {
    const response = raw as TrackingResponse;
    if ((response as ErrorResponse).response?.errors?.[0]) {
      throw new ProviderError(
        `Error found in UPS tracking response: ${JSON.stringify(response)}`,
        { courier: this.name, trackingNumber: "", raw }
      );
    }

    const warnings = (response as SuccessResponse).trackResponse?.shipment?.[0]?.warnings;
    if (warnings?.[0]?.message === "Tracking Information Not Found") {
      throw new ProviderError("Tracking Information Not Found", { courier: this.name, trackingNumber: "", raw });
    }
  }

  protected parseResponse(raw: unknown): { events: TrackingEvent[]; estimatedDeliveryTime?: number } {
    const response = raw as SuccessResponse;
    const shipment = response.trackResponse?.shipment?.[0]?.package?.[0];

    if (!shipment) {
      throw new ProviderError(`Could not find shipment in UPS response: ${JSON.stringify(raw)}`, {
        courier: this.name,
        trackingNumber: "",
        raw,
      });
    }

    const events = shipment.activity.map(getTrackingEvent);
    const estimatedDeliveryTime = getEstimatedDeliveryTime(shipment);

    return { events, estimatedDeliveryTime };
  }
}
