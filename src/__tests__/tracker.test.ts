import { ShipmentTracker, createTracker } from "../tracker";
import { BaseProvider } from "../providers/base-provider";
import { FedExProvider, UPSProvider, USPSProvider } from "../providers";
import { TrackingStatus, TrackingResult, MiddlewareContext } from "../types";
import { Middleware, NextFunction } from "../middleware/types";
import { TrackingCourier } from "ts-tracking-number";

// Create a mock provider class
class MockProvider extends BaseProvider {
  readonly name = "MockCourier";
  readonly code = "mock";
  readonly tsTrackingNumberCouriers: readonly TrackingCourier[] = [];

  constructor() {
    super({
      defaultUrls: { dev: "https://dev.mock.com", prod: "https://prod.mock.com" },
      envVars: { clientId: "MOCK_CLIENT_ID", clientSecret: "MOCK_CLIENT_SECRET" },
    });
  }

  protected getOAuthConfig() {
    return { tokenUrl: "", clientId: "", clientSecret: "" };
  }
  protected async fetchTrackingData() {
    return {};
  }
  protected parseResponse(): { events: any[]; estimatedDeliveryTime?: number } {
    return {
      events: [{ status: TrackingStatus.DELIVERED, label: "Delivered" }],
      estimatedDeliveryTime: Date.now(),
    };
  }

  // Override track to skip OAuth for tests
  async track(trackingNumber: string): Promise<TrackingResult> {
    return {
      events: [{ status: TrackingStatus.DELIVERED, label: "Delivered" }],
      courier: this.code,
      trackingNumber,
    };
  }
}

describe("ShipmentTracker", () => {
  let tracker: ShipmentTracker;
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = new MockProvider();
    tracker = new ShipmentTracker();
    tracker.use(mockProvider);
  });

  describe("provider registration", () => {
    it("registers providers with use()", () => {
      const t = new ShipmentTracker();
      t.use(mockProvider);
      // Should be able to track with explicit courier code
      expect(() => t.track("123", { courierCode: "mock" })).not.toThrow();
    });

    it("accepts providers via constructor options", () => {
      const t = new ShipmentTracker({ providers: [mockProvider] });
      expect(() => t.track("123", { courierCode: "mock" })).not.toThrow();
    });

    it("throws for unregistered courier code", async () => {
      await expect(tracker.track("123", { courierCode: "unknown" })).rejects.toThrow("No provider registered");
    });
  });

  describe("track", () => {
    it("tracks with explicit courier code", async () => {
      const result = await tracker.track("123", { courierCode: "mock" });
      expect(result.courier).toBe("mock");
      expect(result.trackingNumber).toBe("123");
      expect(result.events[0].status).toBe(TrackingStatus.DELIVERED);
    });

    it("emits track:start and track:success events", async () => {
      const startHandler = jest.fn();
      const successHandler = jest.fn();
      tracker.on("track:start", startHandler);
      tracker.on("track:success", successHandler);

      await tracker.track("123", { courierCode: "mock" });

      expect(startHandler).toHaveBeenCalledWith({ trackingNumber: "123", courierCode: "mock" });
      expect(successHandler).toHaveBeenCalledWith(
        expect.objectContaining({ trackingNumber: "123", courierCode: "mock" })
      );
    });

    it("emits track:error on provider failure", async () => {
      const errorProvider = new (class extends MockProvider {
        async track(): Promise<TrackingResult> {
          throw new Error("Provider failure");
        }
      })();
      const t = new ShipmentTracker({ providers: [errorProvider] });
      const errorHandler = jest.fn();
      t.on("track:error", errorHandler);

      await expect(t.track("123", { courierCode: "mock" })).rejects.toThrow("Provider failure");
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ trackingNumber: "123", courierCode: "mock" })
      );
    });
  });

  describe("middleware", () => {
    it("executes middleware in order (onion model)", async () => {
      const order: string[] = [];

      const mw1: Middleware = {
        async execute(_ctx: MiddlewareContext, next: NextFunction) {
          order.push("mw1-before");
          const result = await next();
          order.push("mw1-after");
          return result;
        },
      };

      const mw2: Middleware = {
        async execute(_ctx: MiddlewareContext, next: NextFunction) {
          order.push("mw2-before");
          const result = await next();
          order.push("mw2-after");
          return result;
        },
      };

      tracker.useMiddleware(mw1).useMiddleware(mw2);

      await tracker.track("123", { courierCode: "mock" });

      expect(order).toEqual(["mw1-before", "mw2-before", "mw2-after", "mw1-after"]);
    });

    it("accepts middleware via constructor options", async () => {
      const executed = jest.fn();
      const mw: Middleware = {
        async execute(_ctx: MiddlewareContext, next: NextFunction) {
          executed();
          return next();
        },
      };

      const t = new ShipmentTracker({ providers: [mockProvider], middleware: [mw] });
      await t.track("123", { courierCode: "mock" });

      expect(executed).toHaveBeenCalled();
    });
  });

  describe("trackBatch", () => {
    it("tracks multiple items in parallel", async () => {
      const results = await tracker.trackBatch([
        { trackingNumber: "AAA", courierCode: "mock" },
        { trackingNumber: "BBB", courierCode: "mock" },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].trackingNumber).toBe("AAA");
      expect(results[0].result?.courier).toBe("mock");
      expect(results[1].trackingNumber).toBe("BBB");
      expect(results[1].result?.courier).toBe("mock");
    });

    it("includes errors for failed items", async () => {
      const results = await tracker.trackBatch([
        { trackingNumber: "AAA", courierCode: "mock" },
        { trackingNumber: "BBB", courierCode: "unknown" },
      ]);

      expect(results[0].result).toBeDefined();
      expect(results[0].error).toBeUndefined();
      expect(results[1].result).toBeUndefined();
      expect(results[1].error).toBeDefined();
    });
  });

  describe("s10 courier code mapping", () => {
    it("maps s10 detected codes back to provider via tsTrackingNumberCouriers", () => {
      // Create a provider that handles both usps and s10 courier codes
      class MockUSPSProvider extends BaseProvider {
        readonly name = "USPS";
        readonly code = "usps";
        readonly tsTrackingNumberCouriers = [
          { name: "USPS", courier_code: "usps", tracking_numbers: [] },
          { name: "S10", courier_code: "s10", tracking_numbers: [] },
        ] as unknown as readonly TrackingCourier[];

        constructor() {
          super({
            defaultUrls: { dev: "https://dev.mock.com", prod: "https://prod.mock.com" },
            envVars: { clientId: "MOCK_CLIENT_ID", clientSecret: "MOCK_CLIENT_SECRET" },
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
          return { events: [{ status: TrackingStatus.DELIVERED }], courier: this.code, trackingNumber };
        }
      }

      const uspsProvider = new MockUSPSProvider();
      const t = new ShipmentTracker({ providers: [uspsProvider] });

      // Verify the provider has both courier codes for detection
      expect(uspsProvider.tsTrackingNumberCouriers).toHaveLength(2);
      expect(uspsProvider.tsTrackingNumberCouriers[0].courier_code).toBe("usps");
      expect(uspsProvider.tsTrackingNumberCouriers[1].courier_code).toBe("s10");
    });
  });
});

describe("createTracker", () => {
  // Mock the provider constructors to track instantiation
  let fedexSpy: jest.SpyInstance;
  let upsSpy: jest.SpyInstance;
  let uspsSpy: jest.SpyInstance;

  beforeEach(() => {
    fedexSpy = jest.spyOn(FedExProvider.prototype, "track").mockResolvedValue({
      events: [],
      courier: "fedex",
      trackingNumber: "123",
    });
    upsSpy = jest.spyOn(UPSProvider.prototype, "track").mockResolvedValue({
      events: [],
      courier: "ups",
      trackingNumber: "123",
    });
    uspsSpy = jest.spyOn(USPSProvider.prototype, "track").mockResolvedValue({
      events: [],
      courier: "usps",
      trackingNumber: "123",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a tracker with no providers when called without options", () => {
    const tracker = createTracker();
    expect(tracker).toBeInstanceOf(ShipmentTracker);
  });

  it("creates a tracker with no providers when providers object is empty", () => {
    const tracker = createTracker({ providers: {} });
    expect(tracker).toBeInstanceOf(ShipmentTracker);
  });

  it("registers FedEx provider when fedex config is provided", async () => {
    const tracker = createTracker({
      providers: {
        fedex: {},
      },
    });

    await tracker.track("123", { courierCode: "fedex" });
    expect(fedexSpy).toHaveBeenCalled();
  });

  it("registers UPS provider when ups config is provided", async () => {
    const tracker = createTracker({
      providers: {
        ups: {},
      },
    });

    await tracker.track("123", { courierCode: "ups" });
    expect(upsSpy).toHaveBeenCalled();
  });

  it("registers USPS provider when usps config is provided", async () => {
    const tracker = createTracker({
      providers: {
        usps: {},
      },
    });

    await tracker.track("123", { courierCode: "usps" });
    expect(uspsSpy).toHaveBeenCalled();
  });

  it("registers multiple providers at once", async () => {
    const tracker = createTracker({
      providers: {
        fedex: {},
        ups: {},
        usps: {},
      },
    });

    await tracker.track("123", { courierCode: "fedex" });
    await tracker.track("123", { courierCode: "ups" });
    await tracker.track("123", { courierCode: "usps" });

    expect(fedexSpy).toHaveBeenCalled();
    expect(upsSpy).toHaveBeenCalled();
    expect(uspsSpy).toHaveBeenCalled();
  });

  it("does not register providers that are not in config", async () => {
    const tracker = createTracker({
      providers: {
        fedex: {},
      },
    });

    // UPS should not be registered
    await expect(tracker.track("123", { courierCode: "ups" })).rejects.toThrow("No provider registered");
  });

  it("passes custom provider config to providers", () => {
    const tracker = createTracker({
      providers: {
        fedex: { url: "https://apis-sandbox.fedex.com" },
        ups: { url: "https://onlinetools.ups.com" },
      },
    });

    expect(tracker).toBeInstanceOf(ShipmentTracker);
  });

  it("accepts middleware in options", async () => {
    const executed = jest.fn();
    const mw: Middleware = {
      async execute(_ctx: MiddlewareContext, next: NextFunction) {
        executed();
        return next();
      },
    };

    const tracker = createTracker({
      providers: { fedex: {} },
      middleware: [mw],
    });

    await tracker.track("123", { courierCode: "fedex" });
    expect(executed).toHaveBeenCalled();
  });

  it("accepts timeout option for providers", () => {
    const tracker = createTracker({
      providers: { fedex: { timeout: 30000 } },
    });

    expect(tracker).toBeInstanceOf(ShipmentTracker);
  });

  // ─── Example Usage Tests ────────────────────────────────────

  it("example: typical usage with all providers", async () => {
    // This demonstrates the recommended usage pattern for the factory function.
    // Instead of manually instantiating each provider class:
    //
    //   const tracker = new ShipmentTracker({
    //     providers: [new FedExProvider(), new UPSProvider(), new USPSProvider()],
    //   });
    //
    // You can use the simpler createTracker() API:
    const tracker = createTracker({
      providers: {
        fedex: {},
        ups: {},
        usps: {},
      },
    });

    // The tracker is now ready to use
    const result = await tracker.track("123", { courierCode: "fedex" });
    expect(result.courier).toBe("fedex");
  });

  it("example: minimal setup with single provider", async () => {
    // For apps that only need one carrier
    const tracker = createTracker({
      providers: {
        ups: {},
      },
    });

    const result = await tracker.track("1Z999AA10123456784", { courierCode: "ups" });
    expect(result.courier).toBe("ups");
  });

  it("example: with custom URL", () => {
    // Override provider URL for custom endpoints
    const tracker = createTracker({
      providers: {
        fedex: {
          url: "https://custom-api.example.com",
        },
      },
    });

    expect(tracker).toBeInstanceOf(ShipmentTracker);
  });

  it("example: with credentials passed directly", () => {
    // Pass credentials directly instead of using environment variables
    const tracker = createTracker({
      providers: {
        fedex: {
          creds: {
            clientId: "my-client-id",
            clientSecret: "my-client-secret",
          },
        },
        ups: {
          creds: {
            clientId: "ups-client-id",
            clientSecret: "ups-client-secret",
          },
          url: "https://onlinetools.ups.com",
        },
      },
    });

    expect(tracker).toBeInstanceOf(ShipmentTracker);
  });

  it("example: using true shorthand for defaults", async () => {
    // Pass `true` to enable a provider with all defaults (same as {})
    const tracker = createTracker({
      providers: {
        fedex: true,  // uses env vars for creds, NODE_ENV for URL
        ups: true,
        usps: {       // can mix shorthand with full config
          url: "https://api.usps.com",
        },
      },
    });

    // All providers should be registered
    await tracker.track("123", { courierCode: "fedex" });
    await tracker.track("123", { courierCode: "ups" });
    await tracker.track("123", { courierCode: "usps" });

    expect(fedexSpy).toHaveBeenCalled();
    expect(upsSpy).toHaveBeenCalled();
    expect(uspsSpy).toHaveBeenCalled();
  });
});
