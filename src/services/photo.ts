/**
 * Photo utilities for the Notes feature:
 *   - `resizeImage`: client-side resize + re-encode to JPEG data URL.
 *     Keeps photos under ~500KB each so we can store multiple per note
 *     inside a single KV value (25MB limit).
 *   - `extractTextFromPhoto`: call Gemini Vision to OCR a photo so the
 *     text becomes searchable alongside the note body.
 */
import { getGeminiApiKey } from './gemini';

export interface ResizedPhoto {
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export async function resizeImage(
  file: File | Blob,
  opts?: { maxDim?: number; quality?: number }
): Promise<ResizedPhoto> {
  const maxDim = opts?.maxDim ?? 1920;
  const quality = opts?.quality ?? 0.85;

  const img = await loadImage(file);
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  URL.revokeObjectURL(img.src);
  return {
    dataUrl,
    width,
    height,
    sizeBytes: Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4),
  };
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Extract visible text from a photo using Gemini Vision. Returns an
 * empty string on failure so the caller can save the note regardless.
 *
 * Uses the user's stored Gemini API key. Input is the JPEG data URL
 * produced by `resizeImage`.
 */
export async function extractTextFromPhoto(dataUrl: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return '';

  // Strip "data:image/jpeg;base64," prefix — Gemini wants raw base64
  const m = dataUrl.match(/^data:(image\/[\w+-]+);base64,(.+)$/);
  if (!m) return '';
  const mimeType = m[1];
  const base64 = m[2];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Extract every piece of visible text from this image — brand names, product names, prices, labels, signage, writing, anything legible. Return only the extracted text, no commentary, no headers, no markdown. If nothing legible, return an empty string.' },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0 },
        }),
      }
    );
    if (!res.ok) return '';
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return text;
  } catch {
    return '';
  }
}
