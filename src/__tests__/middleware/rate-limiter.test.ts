import { RateLimiterMiddleware } from "../../middleware/rate-limiter";
import { MiddlewareContext, TrackingResult, TrackingStatus } from "../../types";

const makeResult = (): TrackingResult => ({
  events: [{ status: TrackingStatus.DELIVERED }],
  courier: "test",
  trackingNumber: "123",
});

const makeCtx = (courierCode = "test"): MiddlewareContext =>
  ({
    trackingNumber: "123",
    courierCode,
    provider: {} as any,
    options: {},
  });

describe("RateLimiterMiddleware", () => {
  it("passes through and returns result", async () => {
    const middleware = new RateLimiterMiddleware();
    const result = makeResult();
    const next = jest.fn().mockResolvedValue(result);

    const output = await middleware.execute(makeCtx(), next);
    expect(output).toEqual(result);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("creates separate limiters for different couriers", async () => {
    const middleware = new RateLimiterMiddleware();
    const result = makeResult();
    const next = jest.fn().mockResolvedValue(result);

    await Promise.all([
      middleware.execute(makeCtx("fedex"), next),
      middleware.execute(makeCtx("ups"), next),
    ]);

    expect(next).toHaveBeenCalledTimes(2);
  });
});
