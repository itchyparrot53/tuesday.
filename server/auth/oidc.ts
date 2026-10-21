import {
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';
import type { Config } from '../config';

export interface OidcProvider {
  authUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): Promise<string>;
  callback(input: {
    currentUrl: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<{
    sub: string;
    email: string;
    emailVerified: boolean;
    name: string;
  }>;
}

export function createOidcProvider(config: NonNullable<Config['oidc']>): OidcProvider {
  let cached: Promise<Configuration> | null = null;
  function configuration(): Promise<Configuration> {
    if (!cached) {
      cached = discovery(new URL(config.issuer), config.clientId, config.clientSecret).then(
        (result) => {
          if (process.env.NODE_ENV === 'test') allowInsecureRequests(result);
          return result;
        },
      );
    }
    return cached;
  }

  return {
    async authUrl(input) {
      const server = await configuration();
      return buildAuthorizationUrl(server, {
        redirect_uri: input.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: input.state,
        nonce: input.nonce,
        code_challenge: input.codeChallenge,
        code_challenge_method: 'S256',
      }).href;
    },
    async callback(input) {
      const server = await configuration();
      const tokens = await authorizationCodeGrant(server, input.currentUrl, {
        expectedState: input.state,
        expectedNonce: input.nonce,
        pkceCodeVerifier: input.codeVerifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      return {
        sub: String(claims?.sub ?? ''),
        email: String(claims?.email ?? ''),
        emailVerified: claims?.email_verified === true,
        name: String(claims?.name ?? claims?.email ?? ''),
      };
    },
  };
}

export function oidcPkce(): { verifier: string; state: string; nonce: string } {
  return { verifier: randomPKCECodeVerifier(), state: randomState(), nonce: randomNonce() };
}

export async function oidcChallenge(verifier: string): Promise<string> {
  return calculatePKCECodeChallenge(verifier);
}
