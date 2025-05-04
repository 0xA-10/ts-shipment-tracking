import axios from "axios";

export { reverseOneToManyDictionary } from "tycelium";

export const getLocation = ({
  city,
  country,
  state,
  zip,
}: {
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}) => [city, state, country, zip].filter(Boolean).join(" ") || undefined;

// source: https://github.com/joonhocho/tsdef/blob/4f0a9f07c5ac704604afeb64f52de3fc7709989c/src/index.ts#L222C1-L226C3
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer I> ? Array<DeepPartial<I>> : DeepPartial<T[P]>;
};

export const clientCredentialsTokenRequest = async ({
  url,
  client_id,
  client_secret,
  scope,
  useAuthorizationHeader,
}: {
  url: string;
  client_id: string;
  client_secret: string;
  scope?: string;
  useAuthorizationHeader?: true;
}) => {
  type OAuthTokenResponse = {
    access_token: string;
    token_type: string;
    issued_at: number;
    expires_in: number;
    status: string;
    scope: string;
    issuer: string;
    client_id: string;
    application_name: string;
    api_products: string;
    public_key: string;
  };

  const {
    data: { access_token },
  } = await axios<OAuthTokenResponse>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },

    // Pass the creds as an Authorization header
    ...(useAuthorizationHeader && {
      auth: {
        username: client_id,
        password: client_secret,
      },
    }),

    data: new URLSearchParams({
      // Pass the creds as part of the payload
      ...(!useAuthorizationHeader && {
        client_id,
        client_secret,
      }),

      grant_type: "client_credentials",
      ...(scope && { scope }),
    }),
  });

  return access_token;
};
