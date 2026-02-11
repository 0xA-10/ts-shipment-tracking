import { BaseProvider } from "../../providers/base-provider";
import { TrackingResult, TrackingStatus } from "../../types";
import { TrackingCourier } from "ts-tracking-number";

/**
 * Minimal mock provider for middleware tests.
 * Only implements the interface required by MiddlewareContext.
 */
export class MockProvider extends BaseProvider {
  readonly name = "MockTest";
  readonly code = "mock";
  readonly tsTrackingNumberCouriers: readonly TrackingCourier[] = [];

  constructor() {
    super({
      defaultUrls: { dev: "https://test.mock.com", prod: "https://test.mock.com" },
      envVars: { clientId: "MOCK_ID", clientSecret: "MOCK_SECRET" },
    });
  }

  protected getOAuthConfig() {
    return { tokenUrl: "", clientId: "", clientSecret: "" };
  }

  protected async fetchTrackingData() {
    return {};
  }

  protected parseResponse() {
    return { events: [{ status: TrackingStatus.DELIVERED }] };
  }

  async track(trackingNumber: string): Promise<TrackingResult> {
    return {
      events: [{ status: TrackingStatus.DELIVERED }],
      courier: this.code,
      trackingNumber,
      raw: {},
    };
  }
}
