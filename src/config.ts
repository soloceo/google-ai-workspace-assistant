export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/**
 * Optional OAuth token service (Cloudflare Worker). When configured, the
 * frontend delegates token management to the backend, which holds
 * refresh_tokens server-side — giving permanent auth. When not set, the
 * frontend falls back to the browser-only GIS flow with 1-hour tokens
 * and silent refresh while the Google session is active.
 */
export const AUTH_BACKEND_URL = (import.meta.env.VITE_AUTH_BACKEND_URL || '').replace(/\/$/, '');
export const USE_AUTH_BACKEND = !!AUTH_BACKEND_URL;

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
export const ACCOUNT_COLORS = ['#ea4335', '#4285f4', '#34a853', '#fbbc04', '#9334e6', '#ff6d01'];
