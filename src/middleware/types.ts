import { MiddlewareContext, TrackingResult } from "../types";

export type NextFunction = () => Promise<TrackingResult>;

export interface Middleware {
  execute(ctx: MiddlewareContext, next: NextFunction): Promise<TrackingResult>;
}
