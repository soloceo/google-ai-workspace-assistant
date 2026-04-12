export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const ACCOUNT_COLORS = ['#ea4335', '#4285f4', '#34a853', '#fbbc04', '#9334e6', '#ff6d01'];
