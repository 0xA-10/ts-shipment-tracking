import { AxiosError, AxiosHeaders } from "axios";
import { RetryMiddleware } from "../../middleware/retry";
import { MiddlewareContext, TrackingResult, TrackingStatus } from "../../types";
import { MockProvider } from "../helpers/mock-provider";

const makeResult = (): TrackingResult => ({
  events: [{ status: TrackingStatus.DELIVERED }],
  courier: "test",
  trackingNumber: "123",
  raw: {},
});

const makeCtx = (): MiddlewareContext =>
  ({
    trackingNumber: "123",
    courierCode: "test",
    provider: new MockProvider(),
    options: {},
  });

const makeAxiosError = (status: number): AxiosError => {
  const err = new AxiosError("Request failed");
  err.response = {
    status,
    statusText: "Error",
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return err;
};

describe("RetryMiddleware", () => {
  it("returns on first success", async () => {
    const middleware = new RetryMiddleware({ baseDelayMs: 1 });
    const result = makeResult();
    const next = jest.fn().mockResolvedValue(result);

    const output = await middleware.execute(makeCtx(), next);
    expect(output).toEqual(result);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("retries on 429", async () => {
    const middleware = new RetryMiddleware({ maxAttempts: 3, baseDelayMs: 1 });
    const result = makeResult();
    const next = jest.fn()
      .mockRejectedValueOnce(makeAxiosError(429))
      .mockResolvedValueOnce(result);

    const output = await middleware.execute(makeCtx(), next);
    expect(output).toEqual(result);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("retries on 500", async () => {
    const middleware = new RetryMiddleware({ maxAttempts: 3, baseDelayMs: 1 });
    const result = makeResult();
    const next = jest.fn()
      .mockRejectedValueOnce(makeAxiosError(500))
      .mockResolvedValueOnce(result);

    const output = await middleware.execute(makeCtx(), next);
    expect(output).toEqual(result);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400", async () => {
    const middleware = new RetryMiddleware({ maxAttempts: 3, baseDelayMs: 1 });
    const next = jest.fn().mockRejectedValue(makeAxiosError(400));

    await expect(middleware.execute(makeCtx(), next)).rejects.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("throws after max attempts exhausted", async () => {
    const middleware = new RetryMiddleware({ maxAttempts: 2, baseDelayMs: 1 });
    const next = jest.fn().mockRejectedValue(makeAxiosError(500));

    await expect(middleware.execute(makeCtx(), next)).rejects.toThrow();
    expect(next).toHaveBeenCalledTimes(2);
  });
});
