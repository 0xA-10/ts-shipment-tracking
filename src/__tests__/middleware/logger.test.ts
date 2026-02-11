import { LoggerMiddleware } from "../../middleware/logger";
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

describe("LoggerMiddleware", () => {
  it("logs start and success", async () => {
    const log = jest.fn();
    const middleware = new LoggerMiddleware({ log });
    const next = jest.fn().mockResolvedValue(makeResult());

    await middleware.execute(makeCtx(), next);

    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toContain("start");
    expect(log.mock.calls[1][0]).toContain("success");
  });

  it("logs start and error on failure", async () => {
    const log = jest.fn();
    const middleware = new LoggerMiddleware({ log });
    const next = jest.fn().mockRejectedValue(new Error("test error"));

    await expect(middleware.execute(makeCtx(), next)).rejects.toThrow("test error");

    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toContain("start");
    expect(log.mock.calls[1][0]).toContain("error");
    expect(log.mock.calls[1][0]).toContain("test error");
  });
});
