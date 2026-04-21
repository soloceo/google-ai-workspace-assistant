/**
 * Direct Gemini API calls using the @google/genai SDK (browser-compatible).
 * Replaces all server-side AI routes from server.ts.
 */
import { GoogleGenAI, Type } from '@google/genai';

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

// ── JSON Extraction Helper ──────────────────────────────────

/**
 * Extract a JSON object from a string by finding balanced braces.
 * Handles nested objects correctly, unlike a simple non-greedy regex.
 */
function extractJSON(text: string): object | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractJSONArray(text: string): any[] | null {
  const start = text.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') depth--;
    if (depth === 0) {
      try {
        const result = JSON.parse(text.slice(start, i + 1));
        return Array.isArray(result) ? result : null;
      } catch {
        return null;
      }
    }
  }
  return null;
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
  const parsed = extractJSON(text);
  if (parsed) {
    return parsed as { summary: string; action: string };
  }
  return { summary: text, action: '' };
}

/**
 * Generate a draft based on a prompt and optional context.
 * Replaces POST /api/ai/draft
 */
export async function generateDraft(
  apiKey: string,
  params: {
    prompt: string;
    context?: string;
    lang: string;
    model?: string;
    isReply?: boolean;
    currentDraft?: string;
  }
): Promise<{ draft: string }> {
  if (!apiKey) throw new Error('Gemini API key not configured');

  const client = getClient(apiKey);

  let fullPrompt: string;

  if (params.currentDraft) {
    // Refine mode: user wants to modify an existing draft
    const langInstruction = params.isReply && params.context
      ? 'IMPORTANT: Keep the reply in the SAME language as the original email.'
      : `Respond in ${params.lang === 'zh' ? 'Chinese' : 'English'}.`;

    fullPrompt = `You are a helpful email assistant. The user has a draft and wants you to revise it.

User's modification request: ${params.prompt}

Current draft:
${params.currentDraft}
${params.context ? `\nOriginal email context:\n${params.context}` : ''}

${langInstruction}
Apply the user's requested changes to the draft. Respond ONLY with the revised body content, no explanations.`;
  } else if (params.isReply && params.context) {
    // Auto-reply mode: generate a reply based on the email content
    const instruction = params.prompt?.trim()
      ? params.prompt
      : 'Write a professional, concise reply to this email';

    fullPrompt = `You are a helpful email assistant. ${instruction}.

${params.context}

IMPORTANT: Reply in the SAME language as the original email. Detect the language of the email and match it exactly. The user instruction may be in a different language — that is just their command to you, NOT the desired output language.
Respond ONLY with the reply body content (greeting + body + sign-off), no explanations or subject line.`;
  } else {
    // Compose mode: generate a new draft from prompt
    if (!params.prompt?.trim()) throw new Error('Prompt required');

    fullPrompt = `You are a helpful assistant. Write a draft based on this instruction: ${params.prompt}${params.context ? `\n\nContext:\n${params.context}` : ''}

Respond in ${params.lang === 'zh' ? 'Chinese' : 'English'}.
Respond ONLY with the body content, no explanations.`;
  }

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
    const parsed = extractJSON(text);
    if (parsed) {
      analysis = parsed;
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

// In-memory classification cache (max 500 entries to prevent memory growth)
const MAX_CACHE_SIZE = 500;
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
  let newClassifications: Array<{
    id: string;
    priority: string;
    category: string;
  }> = [];
  const parsed = extractJSONArray(text);
  if (parsed) {
    newClassifications = parsed;
  }

  // Store new classifications in cache
  for (const c of newClassifications) {
    classificationCache.set(c.id, { classification: c, expiry: now + TTL });
  }

  // Clean up expired cache entries + enforce max size
  for (const [key, entry] of classificationCache) {
    if (now >= entry.expiry) classificationCache.delete(key);
  }
  // Evict oldest entries if over limit
  if (classificationCache.size > MAX_CACHE_SIZE) {
    const excess = classificationCache.size - MAX_CACHE_SIZE;
    const keys = classificationCache.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next();
      if (value) classificationCache.delete(value);
    }
  }

  // Merge cached + new results
  const allClassifications = [...cached, ...newClassifications];
  return { classifications: allClassifications };
}

// ── Workspace Tools (Function Calling) ─────────────────────

export const WORKSPACE_TOOLS = [{
  functionDeclarations: [
    // ── Tasks ──
    {
      name: "create_task",
      description: "Create a new task in the user's task list",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Task title" },
          notes: { type: Type.STRING, description: "Optional task notes/description" },
          due: { type: Type.STRING, description: "Due date in YYYY-MM-DD format" },
          listName: { type: Type.STRING, description: "Name of the task list. Defaults to the first list if not specified." },
        },
        required: ["title"],
      },
    },
    {
      name: "complete_task",
      description: "Mark a task as completed by its title",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "The title of the task to complete (fuzzy match)" },
        },
        required: ["title"],
      },
    },
    {
      name: "delete_task",
      description: "Delete a task by its title",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "The title of the task to delete (fuzzy match)" },
        },
        required: ["title"],
      },
    },
    // ── Calendar ──
    {
      name: "create_event",
      description: "Create a new calendar event",
      parameters: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "Event title" },
          start: { type: Type.STRING, description: "Start datetime in YYYY-MM-DDTHH:mm format" },
          end: { type: Type.STRING, description: "End datetime in YYYY-MM-DDTHH:mm format" },
          description: { type: Type.STRING, description: "Event description" },
          location: { type: Type.STRING, description: "Event location" },
        },
        required: ["summary", "start", "end"],
      },
    },
    {
      name: "delete_event",
      description: "Delete a calendar event by its title",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "The title/summary of the event to delete (fuzzy match)" },
        },
        required: ["title"],
      },
    },
    // ── Email ──
    {
      name: "send_email",
      description: "Compose and send a new email",
      parameters: {
        type: Type.OBJECT,
        properties: {
          to: { type: Type.STRING, description: "Recipient email address" },
          subject: { type: Type.STRING, description: "Email subject" },
          body: { type: Type.STRING, description: "Email body content" },
          cc: { type: Type.STRING, description: "CC email addresses, comma separated" },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "archive_email",
      description: "Archive an email by subject (removes from inbox)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, description: "Subject of the email to archive (fuzzy match)" },
        },
        required: ["subject"],
      },
    },
    {
      name: "trash_email",
      description: "Move an email to trash by subject",
      parameters: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, description: "Subject of the email to trash (fuzzy match)" },
        },
        required: ["subject"],
      },
    },
    {
      name: "search_emails",
      description: "Search the user's Gmail for emails matching a query. Use Gmail search syntax (e.g. 'from:alice after:2026/03/01 is:important'). Returns up to 10 results with sender, subject, date, and snippet.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Gmail search query (e.g. 'from:boss after:2026/03/01', 'is:important newer_than:30d', 'subject:invoice')" },
        },
        required: ["query"],
      },
    },
    // ── Notes (personal notebook with photos) ──
    {
      name: "search_notes",
      description: "Search the user's personal notebook. Notes can contain text and photos of products, receipts, labels — photo text is OCR'd at upload time, so brand names, prices, model numbers from pictures are all searchable. Use this when the user asks about something they previously noted down, photographed, or saved.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Keywords to match against note titles, body text, and OCR'd photo text. Multiple words are ANDed together." },
          category: { type: Type.STRING, description: "Optional filter: 'product', 'idea', 'task', or 'other'." },
        },
        required: ["query"],
      },
    },
  ],
}];

/**
 * Chat with AI using streaming + function calling (tool use).
 *
 * Yields either text chunks (string) or tool-call markers.
 * The caller provides `executeAction` to run the actual operations.
 */
export async function* chatStreamWithTools(
  apiKey: string,
  params: {
    message: string;
    history?: Array<{ role: string; text: string }>;
    context?: string;
    lang: string;
    model?: string;
    signal?: AbortSignal;
  },
  executeAction: (name: string, args: Record<string, any>) => Promise<{ success: boolean; message: string }>,
): AsyncGenerator<string> {
  if (!apiKey) throw new Error('Gemini API key not configured');
  if (!params.message?.trim()) throw new Error('Message required');

  const client = getClient(apiKey);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const systemPrompt = `You are a smart Google Workspace AI assistant that can both READ and EXECUTE actions on the user's workspace.

Here is the user's current workspace data:
${params.context || '(no data loaded)'}

Today is ${today}.

Instructions:
- Answer questions based on the provided workspace data.
- When the user asks about emails not in the provided data (e.g. older emails, specific searches), use the search_emails tool with Gmail search syntax (e.g. "newer_than:30d is:important", "from:alice after:2026/03/01", "subject:invoice").
- When the user asks about something they **noted down, photographed, or saved to their notebook** (products they're considering, wine labels, receipts, ideas, items to remember), use the **search_notes** tool. Photo text in notes is OCR'd, so brand names, prices, model numbers from pictures are searchable. Example triggers: "那瓶红酒是什么年份", "我上次拍的耳机是哪个牌子", "what did I save about that book", "remind me of that product I photographed".
- For fuzzy matching: find the closest matching item by title/subject. If ambiguous, ask the user to clarify.
- **IMPORTANT: For CREATE actions (create_task, create_event, send_email), ALWAYS confirm with the user FIRST before executing.** Present the details clearly and ask "确认创建？" or "Should I proceed?". Only call the tool AFTER the user confirms. If the user says something vague like "help me create a task", ask them for the specific details (title, date, etc.) before executing.
- For read-only actions (search_emails, search_notes) and quick actions (complete_task, delete_task, archive_email, trash_email), you may execute directly.
- Be concise. Use bullet points and emoji for readability.
- After executing an action, confirm what you did.
- Respond in ${params.lang === 'zh' ? 'Chinese (Simplified)' : 'English'}.`;

  // Build contents
  const contents: Array<{ role: string; parts: Array<any> }> = [];
  contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
  contents.push({
    role: 'model',
    parts: [{
      text: params.lang === 'zh'
        ? '好的，我已准备好帮助你管理工作区。我可以查询数据，也可以帮你创建任务、发送邮件、管理日历等。请问有什么需要？'
        : 'Ready to help manage your workspace. I can query data, create tasks, send emails, manage calendar, and more. What would you like to do?',
    }],
  });

  if (Array.isArray(params.history)) {
    for (const h of params.history.slice(-10)) {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      });
    }
  }

  contents.push({ role: 'user', parts: [{ text: params.message }] });

  // First call with tools
  const stream = await client.models.generateContentStream({
    model: params.model || 'gemini-2.5-flash',
    contents,
    config: { tools: WORKSPACE_TOOLS },
  });

  const functionCalls: { name: string; args: Record<string, any> }[] = [];
  let textSoFar = '';

  for await (const chunk of stream) {
    if (params.signal?.aborted) break;
    const parts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name as string,
          args: part.functionCall.args as Record<string, any>,
        });
      } else if (part.text) {
        textSoFar += part.text;
        yield part.text;
      }
    }
  }

  // If no function calls, we're done (text was already yielded)
  if (functionCalls.length === 0) return;

  // ── Execute all tool calls ──
  const validFunctionNames = new Set(
    WORKSPACE_TOOLS[0].functionDeclarations.map(f => f.name)
  );
  const modelParts: any[] = [];
  const responseParts: any[] = [];

  for (const call of functionCalls) {
    if (params.signal?.aborted) break;

    // Validate function name against whitelist
    if (!validFunctionNames.has(call.name)) {
      modelParts.push({ functionCall: { name: call.name, args: call.args } });
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { success: false, message: `Unknown function: ${call.name}` },
        },
      });
      continue;
    }

    const actionLabel = params.lang === 'zh'
      ? `\n\n⚡ 正在执行: **${call.name}**...\n`
      : `\n\n⚡ Executing: **${call.name}**...\n`;
    yield actionLabel;

    let actionResult: { success: boolean; message: string };
    try {
      actionResult = await executeAction(call.name, call.args);
    } catch (e: any) {
      actionResult = { success: false, message: e.message || 'Action failed' };
    }

    modelParts.push({ functionCall: { name: call.name, args: call.args } });
    responseParts.push({
      functionResponse: {
        name: call.name,
        response: { success: actionResult.success, message: actionResult.message },
      },
    });
  }

  // ── Send all function results back for natural language confirmation ──
  contents.push({ role: 'model', parts: modelParts });
  contents.push({ role: 'user', parts: responseParts });

  if (params.signal?.aborted) return;

  const followUp = await client.models.generateContentStream({
    model: params.model || 'gemini-2.5-flash',
    contents,
  });

  for await (const chunk of followUp) {
    if (params.signal?.aborted) break;
    const parts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text) yield part.text;
    }
  }
}
