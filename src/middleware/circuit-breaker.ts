import { Middleware, NextFunction } from "./types";
import { MiddlewareContext, TrackingResult } from "../types";
import { TrackingError } from "../errors";

enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

type CircuitInfo = {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
};

export type CircuitBreakerOptions = {
  /** Number of failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in ms before attempting to half-open the circuit. Default: 30000 */
  resetTimeoutMs?: number;
};

export class CircuitBreakerMiddleware implements Middleware {
  private circuits = new Map<string, CircuitInfo>();
  private failureThreshold: number;
  private resetTimeoutMs: number;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 30_000;
  }

  private getCircuit(courierCode: string): CircuitInfo {
    let circuit = this.circuits.get(courierCode);
    if (!circuit) {
      circuit = { state: CircuitState.CLOSED, failures: 0, lastFailureTime: 0 };
      this.circuits.set(courierCode, circuit);
    }
    return circuit;
  }

  async execute(ctx: MiddlewareContext, next: NextFunction): Promise<TrackingResult> {
    const circuit = this.getCircuit(ctx.courierCode);

    if (circuit.state === CircuitState.OPEN) {
      if (Date.now() - circuit.lastFailureTime >= this.resetTimeoutMs) {
        circuit.state = CircuitState.HALF_OPEN;
      } else {
        throw new TrackingError(`Circuit breaker is open for provider "${ctx.courierCode}". Requests are blocked.`);
      }
    }

    try {
      const result = await next();
      // Success: reset circuit
      circuit.state = CircuitState.CLOSED;
      circuit.failures = 0;
      return result;
    } catch (err) {
      circuit.failures++;
      circuit.lastFailureTime = Date.now();
      if (circuit.failures >= this.failureThreshold) {
        circuit.state = CircuitState.OPEN;
      }
      throw err;
    }
  }
}
