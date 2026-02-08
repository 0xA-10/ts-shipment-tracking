import axios, { AxiosError } from "axios";
import { TrackingCourier } from "ts-tracking-number";
import { ProviderCredentials, TrackingEvent, TrackOptions, TrackingResult } from "../types";
import { AuthenticationError, ProviderError } from "../errors";

export type OAuthConfig = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  useAuthorizationHeader?: boolean;
};

/**
 * Base options shared by all providers. Provider-specific options extend this.
 */
export type BaseProviderOptions = {
  /**
   * OAuth credentials. Falls back to environment variables if not provided.
   */
  creds?: ProviderCredentials;
  /**
   * Request timeout in milliseconds.
   */
  timeout?: number;
};

export type ProviderConfig = {
  url?: string;
  creds?: ProviderCredentials;
  timeout?: number;
  scope?: string;
  // Internal: default URLs for when url is not provided
  defaultUrls: { dev: string; prod: string };
  // Internal: env var names for fallback when creds not provided
  envVars: { clientId: string; clientSecret: string };
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

const TOKEN_BUFFER_MS = 60_000;

export abstract class BaseProvider {
  abstract readonly name: string;
  abstract readonly code: string;
  abstract readonly tsTrackingNumberCouriers: readonly TrackingCourier[];

  protected readonly config: ProviderConfig;
  private tokenCache: TokenCache | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  protected abstract getOAuthConfig(baseUrl: string): OAuthConfig;

  protected abstract fetchTrackingData(baseUrl: string, trackingNumber: string, token: string): Promise<unknown>;

  protected abstract parseResponse(raw: unknown): { events: TrackingEvent[]; estimatedDeliveryTime?: number };

  protected checkForError(raw: unknown): void {
    // Hook for subclasses to throw on carrier-specific errors
  }

  async track(trackingNumber: string, opts?: TrackOptions): Promise<TrackingResult> {
    this.validateCreds();

    const baseUrl = this.getBaseUrl();

    try {
      const token = await this.getToken(baseUrl);
      const raw = await this.fetchWithAuthRetry(baseUrl, trackingNumber, token);

      this.checkForError(raw);
      const parsed = this.parseResponse(raw);

      return {
        ...parsed,
        courier: this.code,
        trackingNumber,
        raw,
      };
    } catch (err) {
      if (err instanceof ProviderError || err instanceof AuthenticationError) {
        throw err;
      }

      if ((err as AxiosError).response?.data) {
        throw new ProviderError(JSON.stringify((err as AxiosError).response!.data), {
          courier: this.name,
          trackingNumber,
          raw: (err as AxiosError).response!.data,
          cause: err as Error,
        });
      }

      throw new ProviderError((err as Error).message, {
        courier: this.name,
        trackingNumber,
        cause: err as Error,
      });
    }
  }

  protected getBaseUrl(): string {
    if (this.config.url) {
      return this.config.url;
    }
    // Fall back to default URLs based on NODE_ENV
    return process.env.NODE_ENV === "production"
      ? this.config.defaultUrls.prod
      : this.config.defaultUrls.dev;
  }

  protected getCreds(): ProviderCredentials {
    if (this.config.creds) {
      return this.config.creds;
    }
    return {
      clientId: process.env[this.config.envVars.clientId]!,
      clientSecret: process.env[this.config.envVars.clientSecret]!,
    };
  }

  private validateCreds(): void {
    // Skip validation if creds provided in config
    if (this.config.creds) {
      return;
    }
    // Validate env vars exist
    const { clientId, clientSecret } = this.config.envVars;
    if (!process.env[clientId]) {
      throw new Error(`Environment variable "${clientId}" must be set in order to use ${this.name} tracking.`);
    }
    if (!process.env[clientSecret]) {
      throw new Error(`Environment variable "${clientSecret}" must be set in order to use ${this.name} tracking.`);
    }
  }

  private async getToken(baseUrl: string): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    // Promise-based lock to prevent concurrent token refreshes
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    this.tokenPromise = this.refreshToken(baseUrl);

    try {
      const token = await this.tokenPromise;
      return token;
    } finally {
      this.tokenPromise = null;
    }
  }

  private async refreshToken(baseUrl: string): Promise<string> {
    const oauthConfig = this.getOAuthConfig(baseUrl);

    type OAuthTokenResponse = {
      access_token: string;
      token_type: string;
      issued_at: number;
      expires_in: number;
    };

    const { data } = await axios<OAuthTokenResponse>(oauthConfig.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      ...(oauthConfig.useAuthorizationHeader && {
        auth: {
          username: oauthConfig.clientId,
          password: oauthConfig.clientSecret,
        },
      }),
      data: new URLSearchParams({
        ...(!oauthConfig.useAuthorizationHeader && {
          client_id: oauthConfig.clientId,
          client_secret: oauthConfig.clientSecret,
        }),
        grant_type: "client_credentials",
        ...(oauthConfig.scope && { scope: oauthConfig.scope }),
      }),
    });

    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_BUFFER_MS,
    };

    return data.access_token;
  }

  private async fetchWithAuthRetry(baseUrl: string, trackingNumber: string, token: string): Promise<unknown> {
    try {
      return await this.fetchTrackingData(baseUrl, trackingNumber, token);
    } catch (err) {
      if ((err as AxiosError).response?.status === 401) {
        // Invalidate cache and retry with fresh token
        this.tokenCache = null;
        const newToken = await this.getToken(baseUrl);
        return this.fetchTrackingData(baseUrl, trackingNumber, newToken);
      }
      throw err;
    }
  }
}
