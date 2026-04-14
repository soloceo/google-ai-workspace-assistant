/**
 * Direct Gmail REST API calls.
 * Replaces all server-side Gmail routes from server.ts.
 */
import { googleFetch, base64url, decodeBase64Url, base64ToBlob } from './apiHelpers';
import { GMAIL_API } from '../config';
import type { StoredAccount } from '../types';

// ── Single-Account Operations ───────────────────────────────

/**
 * List messages for one account.
 */
export async function listMessages(
  token: string,
  params: {
    q?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
    signal?: AbortSignal;
  }
): Promise<{ messages: Array<{ id: string; threadId: string }>; nextPageToken?: string }> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.labelIds && params.labelIds.length > 0) {
    for (const label of params.labelIds) {
      searchParams.append('labelIds', label);
    }
  }
  if (params.maxResults) searchParams.set('maxResults', String(params.maxResults));
  if (params.pageToken) searchParams.set('pageToken', params.pageToken);

  const url = `${GMAIL_API}/messages?${searchParams.toString()}`;
  const data = await googleFetch<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(url, token, params.signal ? { signal: params.signal } : {});

  return {
    messages: data.messages || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Get full message details by ID.
 */
export async function getMessage(
  token: string,
  messageId: string,
  signal?: AbortSignal
): Promise<any> {
  return googleFetch(`${GMAIL_API}/messages/${messageId}?format=full`, token, signal ? { signal } : {});
}

/**
 * List all labels for the authenticated account.
 */
export async function listLabels(
  token: string
): Promise<any[]> {
  const data = await googleFetch<{ labels?: any[] }>(
    `${GMAIL_API}/labels`,
    token
  );
  return data.labels || [];
}

/**
 * Modify a single message's labels.
 */
export async function modifyMessage(
  token: string,
  messageId: string,
  body: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<any> {
  return googleFetch(`${GMAIL_API}/messages/${messageId}/modify`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      addLabelIds: body.addLabelIds || [],
      removeLabelIds: body.removeLabelIds || [],
    }),
  });
}

/**
 * Batch modify multiple messages' labels.
 */
export async function batchModifyMessages(
  token: string,
  body: { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<void> {
  await googleFetch(`${GMAIL_API}/messages/batchModify`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids: body.ids,
      addLabelIds: body.addLabelIds || [],
      removeLabelIds: body.removeLabelIds || [],
    }),
  });
}

/**
 * Trash a single message.
 */
export async function trashMessage(
  token: string,
  messageId: string
): Promise<any> {
  return googleFetch(`${GMAIL_API}/messages/${messageId}/trash`, token, {
    method: 'POST',
  });
}

/**
 * Send an email message with optional attachments.
 * Constructs an RFC 2822 MIME message in the browser.
 */
export async function sendMessage(
  token: string,
  params: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    threadId?: string;
    messageId?: string;
    attachments?: Array<{ filename: string; mimeType: string; data: string }>;
  }
): Promise<any> {
  if (!params.to?.trim()) throw new Error('Recipient (to) required');
  if (!params.body?.trim()) throw new Error('Body required');

  // Sanitize header values: strip CR/LF to prevent MIME header injection
  const sanitizeHeader = (val: string) => val.replace(/[\r\n]/g, '');
  const safeTo = sanitizeHeader(params.to);
  const safeCc = params.cc ? sanitizeHeader(params.cc) : '';
  const safeBcc = params.bcc ? sanitizeHeader(params.bcc) : '';
  const safeMessageId = params.messageId ? sanitizeHeader(params.messageId) : '';

  // Encode subject for UTF-8 (RFC 2047 encoded-word)
  const encoder = new TextEncoder();
  const subjectBytes = encoder.encode(params.subject || '');
  let binaryStr = '';
  for (let i = 0; i < subjectBytes.length; i++) {
    binaryStr += String.fromCharCode(subjectBytes[i]);
  }
  const utf8Subject = `=?utf-8?B?${btoa(binaryStr)}?=`;

  let message: string;

  if (Array.isArray(params.attachments) && params.attachments.length > 0) {
    // Multipart MIME message with attachments
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const headerParts = [
      `To: ${safeTo}`,
      safeCc ? `Cc: ${safeCc}` : '',
      safeBcc ? `Bcc: ${safeBcc}` : '',
      `Subject: ${utf8Subject}`,
      safeMessageId ? `In-Reply-To: ${safeMessageId}` : '',
      safeMessageId ? `References: ${safeMessageId}` : '',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      'MIME-Version: 1.0',
    ].filter((part) => part !== '');

    const parts: string[] = [];

    // Part 1: text body
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n` +
        `\r\n` +
        params.body
    );

    // Part N: each attachment
    for (const att of params.attachments) {
      if (!att.filename || !att.data) continue;
      const mimeType = att.mimeType || 'application/octet-stream';
      // Sanitize filename: remove quotes, newlines, and carriage returns to prevent MIME header injection
      const safeFilename = att.filename.replace(/["\\\r\n]/g, '_');
      const encodedFilename = encodeURIComponent(safeFilename);
      parts.push(
        `--${boundary}\r\n` +
          `Content-Type: ${mimeType}; name="${safeFilename}"\r\n` +
          `Content-Disposition: attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}\r\n` +
          `Content-Transfer-Encoding: base64\r\n` +
          `\r\n` +
          att.data
      );
    }

    // Closing boundary
    parts.push(`--${boundary}--`);

    // RFC 2822: blank line separates headers from body
    message = [...headerParts, '', parts.join('\r\n')].join('\r\n');
  } else {
    // Simple text message
    const headerParts = [
      `To: ${safeTo}`,
      safeCc ? `Cc: ${safeCc}` : '',
      safeBcc ? `Bcc: ${safeBcc}` : '',
      `Subject: ${utf8Subject}`,
      safeMessageId ? `In-Reply-To: ${safeMessageId}` : '',
      safeMessageId ? `References: ${safeMessageId}` : '',
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
    ].filter((part) => part !== '');

    // RFC 2822: blank line separates headers from body -- must NOT be filtered out
    message = [...headerParts, '', params.body].join('\r\n');
  }

  // base64url encode the full MIME message
  const encodedMessage = base64url(message);

  return googleFetch(`${GMAIL_API}/messages/send`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw: encodedMessage,
      threadId: params.threadId || undefined,
    }),
  });
}

/**
 * Get raw attachment data from Gmail.
 */
export async function getAttachment(
  token: string,
  messageId: string,
  attachmentId: string
): Promise<{ size: number; data: string }> {
  return googleFetch(
    `${GMAIL_API}/messages/${messageId}/attachments/${attachmentId}`,
    token
  );
}

/**
 * Download an attachment as a Blob, ready for saving or displaying.
 */
export async function downloadAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
  mimeType: string
): Promise<Blob> {
  const attachment = await getAttachment(token, messageId, attachmentId);
  if (!attachment.data) {
    throw new Error('Attachment data not found');
  }

  // Prevent XSS: force safe MIME type for potentially dangerous content
  const dangerousMimes = [
    'text/html',
    'application/xhtml+xml',
    'image/svg+xml',
    'text/xml',
    'application/xml',
  ];
  const safeMimeType = dangerousMimes.some((d) =>
    mimeType.toLowerCase().startsWith(d)
  )
    ? 'application/octet-stream'
    : mimeType;

  return base64ToBlob(attachment.data, safeMimeType);
}

// ── Multi-Account Operations ────────────────────────────────

/**
 * Fetch emails from all accounts, merging and sorting by date.
 * Supports per-account pagination and optional account filtering.
 */
export async function fetchAllAccountEmails(
  accounts: StoredAccount[],
  params: {
    q?: string;
    labelIds?: string[];
    pageTokens?: Record<string, string | null>;
    accountFilter?: string;
    signal?: AbortSignal;
  }
): Promise<{
  items: any[];
  pageTokens: Record<string, string | null>;
  hasMore: boolean;
}> {
  const targets = params.accountFilter
    ? accounts.filter((a) => a.email === params.accountFilter)
    : accounts;

  const labelIds = params.labelIds || ['INBOX'];
  const perAccountTokens = params.pageTokens || {};
  const baseMaxResults = params.q ? 30 : 20;

  const allMessages: any[] = [];
  const nextPageTokens: Record<string, string | null> = {};

  await Promise.all(
    targets.map(async (account) => {
      // Skip accounts that returned null (no more results) on a previous page
      const accountPageToken = perAccountTokens[account.email];
      if (
        Object.keys(perAccountTokens).length > 0 &&
        accountPageToken === null
      ) {
        nextPageTokens[account.email] = null;
        return;
      }

      const maxResults =
        targets.length > 1 ? Math.min(baseMaxResults, 15) : baseMaxResults;

      try {
        const listResult = await listMessages(account.access_token, {
          q: params.q,
          labelIds,
          maxResults,
          pageToken: accountPageToken || undefined,
          signal: params.signal,
        });

        nextPageTokens[account.email] = listResult.nextPageToken || null;

        // Fetch full message details in parallel
        const detailed = await Promise.all(
          listResult.messages.map(async (msg) => {
            try {
              const details = await getMessage(account.access_token, msg.id, params.signal);
              return {
                ...details,
                accountEmail: account.email,
                accountColor: account.color,
              };
            } catch (e) {
              console.error(
                `Error fetching message ${msg.id} from ${account.email}:`,
                e
              );
              return null;
            }
          })
        );

        allMessages.push(...detailed.filter(Boolean));
      } catch (e) {
        console.error(`Gmail API error for ${account.email}:`, e);
        nextPageTokens[account.email] = null;
      }
    })
  );

  // Sort by internalDate (newest first) across all accounts
  allMessages.sort((a, b) => {
    const dateA = Number(a.internalDate || 0);
    const dateB = Number(b.internalDate || 0);
    return dateB - dateA;
  });

  const hasMore = Object.values(nextPageTokens).some((t) => t !== null);

  return {
    items: allMessages,
    pageTokens: nextPageTokens,
    hasMore,
  };
}
