import { CircuitBreakerMiddleware } from "../../middleware/circuit-breaker";
import { TrackingError } from "../../errors";
import { MiddlewareContext, TrackingResult, TrackingStatus } from "../../types";

const makeResult = (): TrackingResult => ({
  events: [{ status: TrackingStatus.DELIVERED }],
  courier: "test",
  trackingNumber: "123",
});

const makeCtx = (): MiddlewareContext =>
  ({
    trackingNumber: "123",
    courierCode: "test",
    provider: {} as any,
    options: {},
  });

describe("CircuitBreakerMiddleware", () => {
  it("passes through on success", async () => {
    const cb = new CircuitBreakerMiddleware({ failureThreshold: 3 });
    const result = makeResult();
    const next = jest.fn().mockResolvedValue(result);

    const output = await cb.execute(makeCtx(), next);
    expect(output).toEqual(result);
  });

  it("opens circuit after threshold failures", async () => {
    const cb = new CircuitBreakerMiddleware({ failureThreshold: 2, resetTimeoutMs: 60000 });
    const next = jest.fn().mockRejectedValue(new Error("fail"));
    const ctx = makeCtx();

    await expect(cb.execute(ctx, next)).rejects.toThrow("fail");
    await expect(cb.execute(ctx, next)).rejects.toThrow("fail");

    // Circuit should now be open
    await expect(cb.execute(ctx, jest.fn())).rejects.toThrow(TrackingError);
    await expect(cb.execute(ctx, jest.fn())).rejects.toThrow("Circuit breaker is open");
  });

  it("resets after timeout", async () => {
    const cb = new CircuitBreakerMiddleware({ failureThreshold: 1, resetTimeoutMs: 10 });
    const next = jest.fn().mockRejectedValueOnce(new Error("fail"));
    const ctx = makeCtx();

    await expect(cb.execute(ctx, next)).rejects.toThrow("fail");

    // Circuit is open
    await expect(cb.execute(ctx, jest.fn())).rejects.toThrow(TrackingError);

    // Wait for timeout
    await new Promise((r) => setTimeout(r, 15));

    // Should be half-open now and allow a request through
    const result = makeResult();
    const successNext = jest.fn().mockResolvedValue(result);
    const output = await cb.execute(ctx, successNext);
    expect(output).toEqual(result);
  });
});
