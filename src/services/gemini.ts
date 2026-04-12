/**
 * Direct Gemini API calls using the @google/genai SDK (browser-compatible).
 * Replaces all server-side AI routes from server.ts.
 */
import { GoogleGenAI } from '@google/genai';

// ── Client Singleton ────────────────────────────────────────

let cachedClient: { key: string; client: GoogleGenAI } | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (cachedClient && cachedClient.key === apiKey) return cachedClient.client;
  const client = new GoogleGenAI({ apiKey });
  cachedClient = { key: apiKey, client };
  return client;
}

// ── API Key Management (localStorage) ───────────────────────

const SETTINGS_KEY = 'workspace_settings';

export function getGeminiApiKey(): string {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return settings.geminiApiKey || '';
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key: string): void {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    settings.geminiApiKey = key;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // If parsing fails, start fresh
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ geminiApiKey: key }));
  }
}

// ── AI Functions ────────────────────────────────────────────

/**
 * Process an email/calendar item with AI.
 * Replaces POST /api/ai/process
 */
export async function processItem(
  apiKey: string,
  params: { item: any; type: string; lang: string; model?: string }
): Promise<{ summary: string; action: string }> {
  if (!apiKey) throw new Error('Gemini API key not configured');

  const client = getClient(apiKey);

  const prompt = `
You are a Google Workspace AI Assistant. Analyze this ${params.type} and provide:
1. A concise summary (max 2 sentences).
2. One clear suggested action.

Item Content: ${JSON.stringify(params.item)}

Respond in ${params.lang === 'zh' ? 'Chinese' : 'English'}.
Respond ONLY with a JSON object: {"summary": "...", "action": "..."}
`;

  const result = await client.models.generateContent({
    model: params.model || 'gemini-2.5-flash',
    contents: prompt,
  });

  const text = result.text || '';
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return { summary: text, action: '' };
    }
  }
  return { summary: text, action: '' };
}

/**
 * Generate a draft based on a prompt and optional context.
 * Replaces POST /api/ai/draft
 */
export async function generateDraft(
  apiKey: string,
  params: { prompt: string; context?: string; lang: string; model?: string }
): Promise<{ draft: string }> {
  if (!apiKey) throw new Error('Gemini API key not configured');
  if (!params.prompt?.trim()) throw new Error('Prompt required');

  const client = getClient(apiKey);

  const fullPrompt = `You are a helpful assistant. Write a draft based on this instruction: ${params.prompt}${params.context ? `\n\nContext:\n${params.context}` : ''}\n\nRespond in ${params.lang === 'zh' ? 'Chinese' : 'English'}.\nRespond ONLY with the body content, no explanations.`;

  const result = await client.models.generateContent({
    model: params.model || 'gemini-2.5-flash',
    contents: fullPrompt,
  });

  return { draft: result.text || '' };
}

/**
 * Chat with AI using streaming. Returns an AsyncGenerator that yields text chunks.
 * Replaces POST /api/ai/chat (SSE streaming).
 *
 * Replicates the system prompt and multi-turn history from server.ts.
 */
export async function* chatStream(
  apiKey: string,
  params: {
    message: string;
    history?: Array<{ role: string; text: string }>;
    context?: string;
    lang: string;
    model?: string;
  }
): AsyncGenerator<string> {
  if (!apiKey) throw new Error('Gemini API key not configured');
  if (!params.message?.trim()) throw new Error('Message required');

  const client = getClient(apiKey);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are a smart Google Workspace AI assistant. The user will ask you questions about their emails and calendar events.

Here is the user's current workspace data:
${params.context || '(no data loaded)'}

Today is ${today}.

Instructions:
- Answer based ONLY on the provided workspace data.
- Be concise but thorough. Use bullet points and emoji for readability.
- When summarizing "today's focus" or "this week", prioritize: unread emails, upcoming meetings, urgent items.
- If asked something not in the data, say so honestly.
- Respond in ${params.lang === 'zh' ? 'Chinese (Simplified)' : 'English'}.`;

  // Build conversation contents for multi-turn
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Add system instruction as first user+model turn
  contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
  contents.push({
    role: 'model',
    parts: [
      {
        text:
          params.lang === 'zh'
            ? '好的，我已准备好帮助你分析工作区数据。请问有什么需要？'
            : 'Ready to help you with your workspace data. What would you like to know?',
      },
    ],
  });

  // Add conversation history (last 10 messages)
  if (Array.isArray(params.history)) {
    for (const h of params.history.slice(-10)) {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      });
    }
  }

  // Add current message
  contents.push({ role: 'user', parts: [{ text: params.message }] });

  // Stream response using the SDK
  const stream = await client.models.generateContentStream({
    model: params.model || 'gemini-2.5-flash',
    contents,
  });

  for await (const chunk of stream) {
    const text = chunk.text || '';
    if (text) {
      yield text;
    }
  }
}

/**
 * Extract text content from an attachment using Gemini's multimodal capabilities.
 * Replaces POST /api/ai/extract-attachment
 *
 * NOTE: In the static frontend, the caller is responsible for fetching the
 * attachment data from Gmail first and passing it as base64.
 */
export async function extractAttachment(
  apiKey: string,
  params: { base64data: string; mimeType: string; model?: string }
): Promise<{ text: string; type: string }> {
  if (!apiKey) throw new Error('Gemini API key not configured');

  const client = getClient(apiKey);
  const mime = params.mimeType || 'application/octet-stream';

  let prompt: string;
  let type: string;

  if (mime === 'application/pdf') {
    prompt =
      'Extract all text content from this PDF document. Preserve the structure.';
    type = 'pdf';
  } else if (mime.startsWith('image/')) {
    prompt =
      'Extract all text (OCR) from this image. If no text, describe the image content.';
    type = 'image';
  } else {
    prompt =
      'Extract and describe the content of this document. Preserve any structure or formatting.';
    type = 'document';
  }

  // Convert URL-safe base64 to standard base64 for the SDK
  const base64data = params.base64data.replace(/-/g, '+').replace(/_/g, '/');

  const result = await client.models.generateContent({
    model: params.model || 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mime, data: base64data } },
        ],
      },
    ],
  });

  return { text: result.text || '', type };
}

/**
 * Analyze an attachment with a specific analysis type.
 * Replaces POST /api/ai/analyze-attachment
 */
export async function analyzeAttachment(
  apiKey: string,
  params: {
    base64data: string;
    mimeType: string;
    analysisType: string;
    lang: string;
    model?: string;
  }
): Promise<{ analysis: string | object; type: string }> {
  if (!apiKey) throw new Error('Gemini API key not configured');

  const client = getClient(apiKey);
  const mime = params.mimeType || 'application/octet-stream';

  const prompts: Record<string, string> = {
    summary: 'Summarize this document concisely in bullet points',
    contract:
      'Analyze this contract. Identify: 1) Key parties, 2) Key obligations, 3) Important dates/deadlines, 4) Financial terms, 5) Risk areas, 6) Unusual clauses. Respond in JSON format.',
    invoice:
      'Extract from this invoice: 1) Invoice number, 2) Date, 3) Vendor name, 4) Line items (description, quantity, price), 5) Total amount, 6) Due date, 7) Payment terms. Respond in JSON format.',
    general: 'Analyze this document and provide key insights.',
  };

  const prompt = prompts[params.analysisType] || prompts.general;
  const langInstruction = `\n\nRespond in ${params.lang === 'zh' ? 'Chinese (Simplified)' : 'English'}.`;

  // Convert URL-safe base64 to standard base64
  const base64data = params.base64data.replace(/-/g, '+').replace(/_/g, '/');

  const result = await client.models.generateContent({
    model: params.model || 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt + langInstruction },
          { inlineData: { mimeType: mime, data: base64data } },
        ],
      },
    ],
  });

  const text = result.text || '';

  // For contract and invoice types, try to parse JSON from the response
  let analysis: string | object = text;
  if (
    params.analysisType === 'contract' ||
    params.analysisType === 'invoice'
  ) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0]);
      } catch {
        analysis = text;
      }
    }
  }

  return { analysis, type: params.analysisType || 'general' };
}

/**
 * Classify a batch of emails by priority and category.
 * Replaces POST /api/ai/classify-emails
 *
 * Includes an in-memory cache with 5-minute TTL (per session).
 */

// In-memory classification cache
const classificationCache = new Map<
  string,
  {
    classification: { id: string; priority: string; category: string };
    expiry: number;
  }
>();

export async function classifyEmails(
  apiKey: string,
  params: {
    emails: Array<{ id: string; [key: string]: any }>;
    lang: string;
    model?: string;
  }
): Promise<{
  classifications: Array<{ id: string; priority: string; category: string }>;
}> {
  if (!apiKey) throw new Error('Gemini API key not configured');

  if (!Array.isArray(params.emails) || params.emails.length === 0) {
    throw new Error('emails array required');
  }
  if (params.emails.length > 20) {
    throw new Error('Maximum 20 emails per batch');
  }

  const now = Date.now();
  const TTL = 5 * 60 * 1000; // 5 minutes

  // Check cache for already-classified emails
  const cached: Array<{ id: string; priority: string; category: string }> = [];
  const uncached: typeof params.emails = [];

  for (const email of params.emails) {
    const entry = classificationCache.get(email.id);
    if (entry && now < entry.expiry) {
      cached.push(entry.classification);
    } else {
      uncached.push(email);
    }
  }

  // If all emails are cached, return immediately
  if (uncached.length === 0) {
    return { classifications: cached };
  }

  const client = getClient(apiKey);

  const prompt = `Classify each email by priority (urgent/high/normal/low) and category (work/personal/finance/newsletter/social/notification). Return a JSON array: [{id, priority, category}]

Respond in ${params.lang === 'zh' ? 'Chinese' : 'English'} for any text fields, but keep priority and category values in English.

Emails:
${JSON.stringify(uncached)}`;

  const result = await client.models.generateContent({
    model: params.model || 'gemini-2.5-flash',
    contents: prompt,
  });

  const text = result.text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);

  let newClassifications: Array<{
    id: string;
    priority: string;
    category: string;
  }> = [];
  if (jsonMatch) {
    try {
      newClassifications = JSON.parse(jsonMatch[0]);
    } catch {
      newClassifications = [];
    }
  }

  // Store new classifications in cache
  for (const c of newClassifications) {
    classificationCache.set(c.id, { classification: c, expiry: now + TTL });
  }

  // Clean up expired cache entries
  for (const [key, entry] of classificationCache) {
    if (now >= entry.expiry) {
      classificationCache.delete(key);
    }
  }

  // Merge cached + new results
  const allClassifications = [...cached, ...newClassifications];
  return { classifications: allClassifications };
}
