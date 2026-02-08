import { CacheMiddleware, MemoryCacheAdapter } from "../../middleware/cache";
import { MiddlewareContext, TrackingResult, TrackingStatus } from "../../types";

const makeResult = (trackingNumber = "123"): TrackingResult => ({
  events: [{ status: TrackingStatus.DELIVERED, label: "Delivered" }],
  courier: "test",
  trackingNumber,
});

const makeCtx = (trackingNumber = "123"): MiddlewareContext =>
  ({
    trackingNumber,
    courierCode: "test",
    provider: {} as any,
    options: {},
  });

describe("MemoryCacheAdapter", () => {
  it("stores and retrieves values", async () => {
    const adapter = new MemoryCacheAdapter();
    const result = makeResult();
    await adapter.set("key", result, 60000);
    expect(await adapter.get("key")).toEqual(result);
  });

  it("returns undefined for expired entries", async () => {
    const adapter = new MemoryCacheAdapter();
    await adapter.set("key", makeResult(), 0);
    // Wait 1ms for expiry
    await new Promise((r) => setTimeout(r, 1));
    expect(await adapter.get("key")).toBeUndefined();
  });

  it("returns undefined for missing keys", async () => {
    const adapter = new MemoryCacheAdapter();
    expect(await adapter.get("missing")).toBeUndefined();
  });
});

describe("CacheMiddleware", () => {
  it("caches results and returns from cache on second call", async () => {
    const middleware = new CacheMiddleware();
    const result = makeResult();
    const next = jest.fn().mockResolvedValue(result);
    const ctx = makeCtx();

    const first = await middleware.execute(ctx, next);
    const second = await middleware.execute(ctx, next);

    expect(first).toEqual(result);
    expect(second).toEqual(result);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("uses separate cache keys for different tracking numbers", async () => {
    const middleware = new CacheMiddleware();
    const next = jest.fn()
      .mockResolvedValueOnce(makeResult("A"))
      .mockResolvedValueOnce(makeResult("B"));

    await middleware.execute(makeCtx("A"), next);
    await middleware.execute(makeCtx("B"), next);

    expect(next).toHaveBeenCalledTimes(2);
  });
});
