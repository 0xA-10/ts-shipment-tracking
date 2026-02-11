export class TrackingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TrackingError";
  }
}

export class ProviderError extends TrackingError {
  public readonly courier: string;
  public readonly trackingNumber: string;
  public readonly raw?: unknown;

  constructor(
    message: string,
    { courier, trackingNumber, raw, cause }: { courier: string; trackingNumber: string; raw?: unknown; cause?: Error }
  ) {
    super(message, { cause });
    this.name = "ProviderError";
    this.courier = courier;
    this.trackingNumber = trackingNumber;
    this.raw = raw;
  }
}

export class AuthenticationError extends ProviderError {
  constructor(
    message: string,
    { courier, trackingNumber, cause }: { courier: string; trackingNumber: string; cause?: Error }
  ) {
    super(message, { courier, trackingNumber, cause });
    this.name = "AuthenticationError";
  }
}
