import { z } from "zod";
import { TrackingStatus } from "./types";

export const TrackingEventSchema = z.object({
  status: z.nativeEnum(TrackingStatus).optional(),
  label: z.string().optional(),
  location: z.string().optional(),
  time: z.number().optional(),
});

export const TrackingResultSchema = z.object({
  events: z.array(TrackingEventSchema),
  estimatedDeliveryTime: z.number().optional(),
  courier: z.string(),
  trackingNumber: z.string(),
  raw: z.unknown(),
});
