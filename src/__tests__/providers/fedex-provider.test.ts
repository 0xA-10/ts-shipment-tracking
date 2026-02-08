import axios from "axios";
import { FedExProvider } from "../../providers/fedex-provider";
import { TrackingStatus } from "../../types";
import { ProviderError } from "../../errors";
import fedexSuccess from "../__fixtures__/fedex-success.json";
import fedexError from "../__fixtures__/fedex-error.json";

jest.mock("axios");
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe("FedExProvider", () => {
  let provider: FedExProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEDEX_CLIENT_ID = "test-id";
    process.env.FEDEX_CLIENT_SECRET = "test-secret";
    provider = new FedExProvider();
  });

  afterEach(() => {
    delete process.env.FEDEX_CLIENT_ID;
    delete process.env.FEDEX_CLIENT_SECRET;
  });

  it("has correct name and code", () => {
    expect(provider.name).toBe("FedEx");
    expect(provider.code).toBe("fedex");
  });

  describe("parseResponse", () => {
    it("parses a successful response", () => {
      const parsed = (provider as any).parseResponse(fedexSuccess);

      expect(parsed.events).toHaveLength(4);
      expect(parsed.events[0]).toEqual({
        status: TrackingStatus.DELIVERED,
        label: "Delivered",
        location: "RICHMOND VA US 23220",
        time: expect.any(Number),
      });
      expect(parsed.events[1].status).toBe(TrackingStatus.OUT_FOR_DELIVERY);
      expect(parsed.events[2].status).toBe(TrackingStatus.IN_TRANSIT);
      expect(parsed.events[3].status).toBe(TrackingStatus.IN_TRANSIT); // PU = Picked up
    });

    it("parses estimated delivery time from estimatedDeliveryTimeWindow", () => {
      const parsed = (provider as any).parseResponse(fedexSuccess);
      expect(parsed.estimatedDeliveryTime).toBe(Date.parse("2024-01-15T08:00:00"));
    });

    it("falls back to standardTransitTimeWindow", () => {
      const fixture = JSON.parse(JSON.stringify(fedexSuccess));
      fixture.output.completeTrackResults[0].trackResults[0].estimatedDeliveryTimeWindow.type = "OTHER";
      const parsed = (provider as any).parseResponse(fixture);
      expect(parsed.estimatedDeliveryTime).toBe(Date.parse("2024-01-16T08:00:00"));
    });
  });

  describe("checkForError", () => {
    it("throws on error response", () => {
      expect(() => (provider as any).checkForError(fedexError)).toThrow(ProviderError);
    });

    it("does not throw on success response", () => {
      expect(() => (provider as any).checkForError(fedexSuccess)).not.toThrow();
    });
  });

  describe("track", () => {
    it("orchestrates token fetch and tracking", async () => {
      mockedAxios
        .mockResolvedValueOnce({ data: { access_token: "test-token", expires_in: 3600 } })
        .mockResolvedValueOnce({ data: fedexSuccess });

      const result = await provider.track("123456789012");

      expect(result.courier).toBe("fedex");
      expect(result.trackingNumber).toBe("123456789012");
      expect(result.events).toHaveLength(4);
      expect(result.raw).toEqual(fedexSuccess);
    });

    it("caches token across calls", async () => {
      mockedAxios
        .mockResolvedValueOnce({ data: { access_token: "test-token", expires_in: 3600 } })
        .mockResolvedValueOnce({ data: fedexSuccess })
        .mockResolvedValueOnce({ data: fedexSuccess });

      await provider.track("123456789012");
      await provider.track("123456789012");

      // Token request should only happen once
      expect(mockedAxios).toHaveBeenCalledTimes(3);
    });

    it("throws when env vars are missing", async () => {
      delete process.env.FEDEX_CLIENT_ID;
      await expect(provider.track("123456789012")).rejects.toThrow(
        'Environment variable "FEDEX_CLIENT_ID" must be set'
      );
    });
  });

  describe("status code mappings", () => {
    const makeResponse = (eventType: string) => ({
      output: {
        completeTrackResults: [
          {
            trackingNumber: "123",
            trackResults: [
              {
                scanEvents: [{ eventType, eventDescription: "Test", scanLocation: {}, date: "2024-01-01T00:00:00" }],
                estimatedDeliveryTimeWindow: { window: { begins: "", ends: "" }, type: "" },
                standardTransitTimeWindow: { window: { begins: "", ends: "" }, type: "" },
              },
            ],
          },
        ],
      },
    });

    it.each([
      ["OC", TrackingStatus.LABEL_CREATED],
      ["PU", TrackingStatus.IN_TRANSIT],
      ["HP", TrackingStatus.IN_TRANSIT],
      ["IT", TrackingStatus.IN_TRANSIT],
      ["AA", TrackingStatus.IN_TRANSIT],
      ["OD", TrackingStatus.OUT_FOR_DELIVERY],
      ["RS", TrackingStatus.RETURNED_TO_SENDER],
      ["CA", TrackingStatus.EXCEPTION],
      ["PX", TrackingStatus.EXCEPTION],
      ["CH", TrackingStatus.EXCEPTION],
      ["DL", TrackingStatus.DELIVERED],
    ])("maps %s to %s", (code, expected) => {
      const parsed = (provider as any).parseResponse(makeResponse(code));
      expect(parsed.events[0].status).toBe(expected);
    });
  });
});
