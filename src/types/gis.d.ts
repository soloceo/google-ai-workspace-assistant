/**
 * TypeScript declarations for Google Identity Services (GIS)
 * https://developers.google.com/identity/oauth2/web/reference/js-reference
 *
 * This is an ambient declaration file (no imports/exports) so the `google`
 * namespace is available globally without explicit import.
 */

declare namespace google.accounts.oauth2 {
  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message: string }) => void;
    hint?: string;
    hosted_domain?: string;
    prompt?: '' | 'none' | 'consent' | 'select_account';
    state?: string;
  }

  interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    error?: string;
    error_description?: string;
    error_uri?: string;
  }

  interface TokenClient {
    requestAccessToken(overrideConfig?: {
      hint?: string;
      prompt?: '' | 'none' | 'consent' | 'select_account';
      scope?: string;
      state?: string;
    }): void;
  }

  interface RevokeResponse {
    successful: boolean;
    error?: string;
    error_description?: string;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;

  function revoke(accessToken: string, callback?: (response: RevokeResponse) => void): void;

  function hasGrantedAllScopes(
    tokenResponse: TokenResponse,
    firstScope: string,
    ...restScopes: string[]
  ): boolean;

  function hasGrantedAnyScope(
    tokenResponse: TokenResponse,
    firstScope: string,
    ...restScopes: string[]
  ): boolean;
}

declare namespace google.accounts.id {
  interface IdConfiguration {
    client_id: string;
    callback?: (response: { credential: string; select_by: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }

  function initialize(config: IdConfiguration): void;
  function prompt(momentListener?: (notification: {
    isDisplayed: () => boolean;
    isNotDisplayed: () => boolean;
    getNotDisplayedReason: () => string;
    isSkippedMoment: () => boolean;
    getSkippedReason: () => string;
    isDismissedMoment: () => boolean;
    getDismissedReason: () => string;
  }) => void): void;
  function disableAutoSelect(): void;
  function revoke(hint: string, callback?: (response: { successful: boolean; error?: string }) => void): void;
}

interface Window {
  google?: typeof google;
}
