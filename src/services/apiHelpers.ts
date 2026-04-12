/**
 * Shared API helper utilities for browser-based Google API calls.
 */

/**
 * Custom error class for 401 Unauthorized responses, enabling token refresh flows.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Fetch wrapper that adds Bearer token auth and throws on non-ok responses.
 * On 401, throws `UnauthorizedError` so callers can trigger token refresh.
 */
export async function googleFetch<T = any>(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    throw new UnauthorizedError('Token expired or revoked');
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Google API error ${response.status}: ${errorBody}`);
  }

  // Some endpoints (DELETE) may return 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json();
}

/**
 * Browser-compatible base64url encoding for MIME messages.
 * Properly handles UTF-8 via TextEncoder.
 */
export function base64url(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  // Convert Uint8Array to binary string
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Standard base64 → URL-safe base64
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode Gmail's URL-safe base64 string to a Uint8Array.
 */
export function decodeBase64Url(data: string): Uint8Array {
  // Convert URL-safe base64 to standard base64
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert an ArrayBuffer to a standard base64 string.
 * Useful for preparing file uploads.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a standard base64 string to a Blob with the given MIME type.
 * Used for attachment downloads.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  // Handle URL-safe base64 as well
  let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = standardBase64.length % 4;
  if (pad) {
    standardBase64 += '='.repeat(4 - pad);
  }
  const binary = atob(standardBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
