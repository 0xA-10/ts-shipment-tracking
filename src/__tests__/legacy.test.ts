import axios from "axios";
import { track } from "../legacy";
import { TrackingInfo, TrackingStatus } from "../types";

jest.mock("axios");
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe("legacy track()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FEDEX_CLIENT_ID = "test-id";
    process.env.FEDEX_CLIENT_SECRET = "test-secret";
    process.env.UPS_CLIENT_ID = "test-id";
    process.env.UPS_CLIENT_SECRET = "test-secret";
    process.env.USPS_DEV_CLIENT_ID = "test-id";
    process.env.USPS_DEV_CLIENT_SECRET = "test-secret";
    process.env.USPS_PROD_CLIENT_ID = "test-id";
    process.env.USPS_PROD_CLIENT_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.FEDEX_CLIENT_ID;
    delete process.env.FEDEX_CLIENT_SECRET;
    delete process.env.UPS_CLIENT_ID;
    delete process.env.UPS_CLIENT_SECRET;
    delete process.env.USPS_DEV_CLIENT_ID;
    delete process.env.USPS_DEV_CLIENT_SECRET;
    delete process.env.USPS_PROD_CLIENT_ID;
    delete process.env.USPS_PROD_CLIENT_SECRET;
  });

  it("returns TrackingInfo shape with events and estimatedDeliveryTime", async () => {
    const fedexResponse = {
      output: {
        completeTrackResults: [
          {
            trackingNumber: "123456789012",
            trackResults: [
              {
                scanEvents: [
                  {
                    eventType: "DL",
                    eventDescription: "Delivered",
                    scanLocation: { city: "CITY", stateOrProvinceCode: "ST", countryCode: "US", postalCode: "12345" },
                    date: "2024-01-15T14:30:00-05:00",
                  },
                ],
                estimatedDeliveryTimeWindow: {
                  window: { begins: "2024-01-15T08:00:00", ends: "2024-01-15T20:00:00" },
                  type: "ESTIMATED_DELIVERY",
                },
                standardTransitTimeWindow: {
                  window: { begins: "", ends: "" },
                  type: "",
                },
              },
            ],
          },
        ],
      },
    };

    mockedAxios
      .mockResolvedValueOnce({ data: { access_token: "token", expires_in: 3600 } })
      .mockResolvedValueOnce({ data: fedexResponse });

    const result = await track("123456789012", { courierCode: "fedex" });

    // Verify v1 TrackingInfo shape
    expect(result).toHaveProperty("events");
    expect(result).toHaveProperty("estimatedDeliveryTime");
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events[0]).toHaveProperty("status");
    expect(result.events[0]).toHaveProperty("label");
    expect(result.events[0]).toHaveProperty("location");
    expect(result.events[0]).toHaveProperty("time");

    // Should NOT have v2-only fields
    expect(result).not.toHaveProperty("courier");
    expect(result).not.toHaveProperty("trackingNumber");
    expect(result).not.toHaveProperty("raw");

    // Verify values
    const info = result as TrackingInfo;
    expect(info.events[0].status).toBe(TrackingStatus.DELIVERED);
    expect(info.estimatedDeliveryTime).toBe(Date.parse("2024-01-15T08:00:00"));
  });

  it("throws on unregistered courier code", async () => {
    await expect(track("123", { courierCode: "invalid" })).rejects.toThrow("No provider registered");
  });
});
