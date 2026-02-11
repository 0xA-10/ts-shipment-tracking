import axios from "axios";
import { USPSProvider } from "../../providers/usps-provider";
import { TrackingStatus } from "../../types";
import { ProviderError } from "../../errors";
import uspsSuccess from "../__fixtures__/usps-success.json";
import uspsError from "../__fixtures__/usps-error.json";

jest.mock("axios");
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

type USPSEventFixture = {
  eventZIP?: string;
  [key: string]: unknown;
};

describe("USPSProvider", () => {
  let provider: USPSProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USPS_CLIENT_ID = "test-client-id";
    process.env.USPS_CLIENT_SECRET = "test-client-secret";
    provider = new USPSProvider();
  });

  afterEach(() => {
    delete process.env.USPS_CLIENT_ID;
    delete process.env.USPS_CLIENT_SECRET;
  });

  it("has correct name and code", () => {
    expect(provider.name).toBe("USPS");
    expect(provider.code).toBe("usps");
  });

  describe("parseResponse", () => {
    it("parses a successful response", () => {
      // Note: Using `as any` to access protected methods for unit testing.
      // These methods are not part of the public API but need testing to ensure
      // proper error handling and response parsing behavior.
      // Wrap in array for v3r2 POST endpoint response format
      const v3r2Response = [
        {
          ...uspsSuccess,
          deliveryDateExpectation: {
            expectedDeliveryDate: "2024-01-16",
          },
          trackingEvents: uspsSuccess.trackingEvents.map((event: USPSEventFixture) => ({
            ...event,
            eventZIPCode: event.eventZIP, // Map old field name to new
          })),
        },
      ];

      const parsed = (provider as any).parseResponse(v3r2Response);

      expect(parsed.events).toHaveLength(4);
      expect(parsed.events[0]).toEqual({
        status: TrackingStatus.DELIVERED,
        label: "Delivered, In/At Mailbox",
        location: "RICHMOND VA US 23220",
        time: Date.parse("2024-01-15T19:30:12.041Z"),
      });
      expect(parsed.events[1].status).toBe(TrackingStatus.OUT_FOR_DELIVERY);
      // eventCode "07" is not in status map -> falls back to undefined
      expect(parsed.events[2].status).toBeUndefined();
      expect(parsed.events[3].status).toBe(TrackingStatus.LABEL_CREATED);
    });

    it("parses estimated delivery time", () => {
      // Wrap in array for v3r2 POST endpoint response format
      const v3r2Response = [
        {
          ...uspsSuccess,
          deliveryDateExpectation: {
            expectedDeliveryDate: "2024-01-16T14:00:00Z",
          },
        },
      ];

      const parsed = (provider as any).parseResponse(v3r2Response);
      expect(parsed.estimatedDeliveryTime).toBe(Date.parse("2024-01-16T14:00:00Z"));
    });
  });

  describe("checkForError", () => {
    it("throws on error response", () => {
      expect(() => (provider as any).checkForError(uspsError)).toThrow(ProviderError);
    });

    it("does not throw on success response", () => {
      // Wrap in array for v3r2 response format
      expect(() => (provider as any).checkForError([uspsSuccess])).not.toThrow();
    });
  });

  describe("track", () => {
    it("orchestrates token fetch and tracking", async () => {
      // Wrap in array for v3r2 POST endpoint response format
      const v3r2Response = [
        {
          ...uspsSuccess,
          deliveryDateExpectation: {
            expectedDeliveryDate: "2024-01-16",
          },
          trackingEvents: uspsSuccess.trackingEvents.map((event: USPSEventFixture) => ({
            ...event,
            eventZIPCode: event.eventZIP,
          })),
        },
      ];

      mockedAxios
        .mockResolvedValueOnce({ data: { access_token: "test-token", expires_in: 3600 } })
        .mockResolvedValueOnce({ data: v3r2Response });

      const result = await provider.track("9400111899223100012927");

      expect(result.courier).toBe("usps");
      expect(result.trackingNumber).toBe("9400111899223100012927");
      expect(result.events).toHaveLength(4);

      // Verify POST method and correct URL
      const trackingCall = mockedAxios.mock.calls[1];
      expect(trackingCall[0]).toContain("/tracking");
      expect(trackingCall[1]?.method).toBe("POST");
    });

    it("uses sandbox URL when configured", async () => {
      const devProvider = new USPSProvider({ url: "https://apis-tem.usps.com/tracking/v3r2" });
      const v3r2Response = [uspsSuccess];

      mockedAxios
        .mockResolvedValueOnce({ data: { access_token: "test-token", expires_in: 3600 } })
        .mockResolvedValueOnce({ data: v3r2Response });

      await devProvider.track("9400111899223100012927");

      const tokenCall = mockedAxios.mock.calls[0];
      expect(tokenCall[0]).toBe("https://apis-tem.usps.com/tracking/v3r2/oauth2/v3/token");
    });

    it("uses production URL when configured", async () => {
      const prodProvider = new USPSProvider({ url: "https://apis.usps.com/tracking/v3r2" });
      const v3r2Response = [uspsSuccess];

      mockedAxios
        .mockResolvedValueOnce({ data: { access_token: "test-token", expires_in: 3600 } })
        .mockResolvedValueOnce({ data: v3r2Response });

      await prodProvider.track("9400111899223100012927");

      const tokenCall = mockedAxios.mock.calls[0];
      expect(tokenCall[0]).toBe("https://apis.usps.com/tracking/v3r2/oauth2/v3/token");
    });
  });

  describe("status code mappings", () => {
    const makeResponse = (eventCode: string) => [
      {
        trackingNumber: "9400111899223100012927",
        deliveryDateExpectation: {
          expectedDeliveryDate: "2024-01-16",
        },
        trackingEvents: [
          {
            eventType: "Test Event",
            eventCode,
            eventCity: "RICHMOND",
            eventState: "VA",
            eventCountry: "US",
            eventZIPCode: "23220", // v3r2 uses eventZIPCode instead of eventZIP
            eventTimestamp: "2024-01-15T19:30:12.041Z",
          },
        ],
      },
    ];

    it.each([
      ["MA", TrackingStatus.LABEL_CREATED],
      ["GX", TrackingStatus.LABEL_CREATED],
      ["59", TrackingStatus.OUT_FOR_DELIVERY],
      ["OF", TrackingStatus.OUT_FOR_DELIVERY],
      ["02", TrackingStatus.DELIVERY_ATTEMPTED],
      ["52", TrackingStatus.DELIVERY_ATTEMPTED],
      ["31", TrackingStatus.DELIVERY_ATTEMPTED],
      ["09", TrackingStatus.RETURNED_TO_SENDER],
      ["17", TrackingStatus.RETURNED_TO_SENDER],
      ["01", TrackingStatus.DELIVERED],
      ["DL", TrackingStatus.DELIVERED],
      ["60", TrackingStatus.IN_TRANSIT],
      // Unmapped code with eventCode present -> undefined (not IN_TRANSIT fallback)
      // IN_TRANSIT fallback only applies when eventCode is falsy
      ["07", undefined],
    ])("maps %s to %s", (code, expected) => {
      const parsed = (provider as any).parseResponse(makeResponse(code));
      expect(parsed.events[0].status).toBe(expected);
    });
  });
});
