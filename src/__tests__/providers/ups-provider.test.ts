import axios from "axios";
import { UPSProvider } from "../../providers/ups-provider";
import { TrackingStatus } from "../../types";
import { ProviderError } from "../../errors";
import upsSuccess from "../__fixtures__/ups-success.json";
import upsError from "../__fixtures__/ups-error.json";
import upsDeliveryAttempted from "../__fixtures__/ups-delivery-attempted.json";

jest.mock("axios");
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe("UPSProvider", () => {
  let provider: UPSProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.UPS_CLIENT_ID = "test-id";
    process.env.UPS_CLIENT_SECRET = "test-secret";
    provider = new UPSProvider();
  });

  afterEach(() => {
    delete process.env.UPS_CLIENT_ID;
    delete process.env.UPS_CLIENT_SECRET;
  });

  it("has correct name and code", () => {
    expect(provider.name).toBe("UPS");
    expect(provider.code).toBe("ups");
  });

  describe("parseResponse", () => {
    it("parses a successful response", () => {
      const parsed = (provider as any).parseResponse(upsSuccess);

      expect(parsed.events).toHaveLength(4);
      expect(parsed.events[0]).toEqual({
        status: TrackingStatus.DELIVERED,
        label: "DELIVERED",
        location: "NEW YORK NY US 10001",
        time: expect.any(Number),
      });
      expect(parsed.events[1].status).toBe(TrackingStatus.OUT_FOR_DELIVERY);
      expect(parsed.events[2].status).toBe(TrackingStatus.IN_TRANSIT);
      expect(parsed.events[3].status).toBe(TrackingStatus.LABEL_CREATED);
    });

    it("parses estimated delivery time with EDW type", () => {
      const parsed = (provider as any).parseResponse(upsSuccess);
      expect(parsed.estimatedDeliveryTime).toEqual(expect.any(Number));
    });

    it("returns undefined estimated delivery when type is not EDW", () => {
      const fixture = JSON.parse(JSON.stringify(upsSuccess));
      fixture.trackResponse.shipment[0].package[0].deliveryTime.type = "OTHER";
      const parsed = (provider as any).parseResponse(fixture);
      expect(parsed.estimatedDeliveryTime).toBeUndefined();
    });
  });

  describe("DELIVERY_ATTEMPTED special case", () => {
    it('remaps EXCEPTION to DELIVERY_ATTEMPTED when description contains "DELIVERY ATTEMPTED"', () => {
      const parsed = (provider as any).parseResponse(upsDeliveryAttempted);
      expect(parsed.events[0].status).toBe(TrackingStatus.DELIVERY_ATTEMPTED);
    });
  });

  describe("checkForError", () => {
    it("throws on error response", () => {
      expect(() => (provider as any).checkForError(upsError)).toThrow(ProviderError);
    });

    it("throws on tracking not found warning", () => {
      const response = {
        trackResponse: {
          shipment: [
            {
              package: [],
              warnings: [{ code: "W001", message: "Tracking Information Not Found" }],
            },
          ],
        },
      };
      expect(() => (provider as any).checkForError(response)).toThrow(ProviderError);
    });

    it("does not throw on success response", () => {
      expect(() => (provider as any).checkForError(upsSuccess)).not.toThrow();
    });
  });

  describe("track", () => {
    it("orchestrates token fetch and tracking", async () => {
      mockedAxios
        .mockResolvedValueOnce({ data: { access_token: "test-token", expires_in: 3600 } })
        .mockResolvedValueOnce({ data: upsSuccess });

      const result = await provider.track("1Z999AA10123456784");

      expect(result.courier).toBe("ups");
      expect(result.trackingNumber).toBe("1Z999AA10123456784");
      expect(result.events).toHaveLength(4);
    });
  });

  describe("status code mappings", () => {
    const makeResponse = (type: string, description = "Test") => ({
      trackResponse: {
        shipment: [
          {
            package: [
              {
                activity: [
                  {
                    status: { description, type },
                    location: { address: {} },
                    date: "20240101",
                    time: "120000",
                  },
                ],
                deliveryDate: [],
                deliveryTime: { endTime: "", startTime: "", type: "" },
                statusCode: type,
                trackingNumber: "1Z999",
              },
            ],
            warnings: [],
          },
        ],
      },
    });

    it.each([
      ["M", TrackingStatus.LABEL_CREATED],
      ["P", TrackingStatus.LABEL_CREATED],
      ["I", TrackingStatus.IN_TRANSIT],
      ["O", TrackingStatus.OUT_FOR_DELIVERY],
      ["RS", TrackingStatus.RETURNED_TO_SENDER],
      ["X", TrackingStatus.EXCEPTION],
      ["D", TrackingStatus.DELIVERED],
    ])("maps %s to %s", (code, expected) => {
      const parsed = (provider as any).parseResponse(makeResponse(code));
      expect(parsed.events[0].status).toBe(expected);
    });
  });
});
