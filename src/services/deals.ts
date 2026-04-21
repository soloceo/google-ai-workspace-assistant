/**
 * Real estate deal tracker — talks to the Cloudflare Worker's /deals
 * endpoints. Each deal has a type (sell/buy/rent/other) and a stage
 * index into that type's stage list. Stage labels live in the frontend
 * (see DEAL_STAGES below) so we can translate them without touching
 * the Worker.
 */
import { AUTH_BACKEND_URL, USE_AUTH_BACKEND } from '../config';
import type { Deal, DealType } from '../types';

/**
 * Hardcoded stage lists per deal type. Keys are translation keys that
 * map to labels in translations.ts. Order matters — stageIndex is an
 * offset into this list.
 */
export const DEAL_STAGES: Record<DealType, { key: string; emoji: string }[]> = {
  sell: [
    { key: 'dealStageSignListing',   emoji: '📝' },
    { key: 'dealStagePhotoValuation', emoji: '📸' },
    { key: 'dealStageListed',        emoji: '🏷️' },
    { key: 'dealStageShowing',       emoji: '👀' },
    { key: 'dealStageOfferReceived', emoji: '📨' },
    { key: 'dealStageNegotiating',   emoji: '🤝' },
    { key: 'dealStageOfferAccepted', emoji: '✅' },
    { key: 'dealStageClosingPeriod', emoji: '📋' },
    { key: 'dealStageClosed',        emoji: '🏁' },
    { key: 'dealStageCommissioned',  emoji: '💰' },
  ],
  buy: [
    { key: 'dealStageNeedsConfirmed', emoji: '🎯' },
    { key: 'dealStagePreapproval',    emoji: '💳' },
    { key: 'dealStageViewing',        emoji: '👀' },
    { key: 'dealStageOfferSubmitted', emoji: '📨' },
    { key: 'dealStageNegotiating',    emoji: '🤝' },
    { key: 'dealStageOfferAccepted',  emoji: '✅' },
    { key: 'dealStageClosingPeriod',  emoji: '📋' },
    { key: 'dealStageClosed',         emoji: '🏁' },
  ],
  rent: [
    { key: 'dealStageRentListed',   emoji: '🏷️' },
    { key: 'dealStageViewing',      emoji: '👀' },
    { key: 'dealStageSigningLease', emoji: '📝' },
    { key: 'dealStageDepositPaid',  emoji: '💵' },
    { key: 'dealStageMovein',       emoji: '🔑' },
  ],
  other: [
    { key: 'dealStageStart',    emoji: '🟡' },
    { key: 'dealStageInProgress', emoji: '🔵' },
    { key: 'dealStageComplete', emoji: '🟢' },
  ],
};

export const DEAL_TYPE_META: Record<DealType, { emoji: string; labelKey: string }> = {
  sell:  { emoji: '🏠', labelKey: 'dealTypeSell' },
  buy:   { emoji: '🔑', labelKey: 'dealTypeBuy' },
  rent:  { emoji: '📅', labelKey: 'dealTypeRent' },
  other: { emoji: '📦', labelKey: 'dealTypeOther' },
};

/** Progress 0-100 derived from current stage index. */
export function progressForStage(type: DealType, stageIndex: number): number {
  const total = DEAL_STAGES[type].length;
  if (total <= 1) return stageIndex >= total - 1 ? 100 : 0;
  // Completing last stage = 100%, first stage = ~10% to show "started"
  const pct = ((stageIndex + 1) / total) * 100;
  return Math.round(pct);
}

export class DealsUnavailableError extends Error {
  constructor() {
    super('Deals require the Cloudflare Worker backend (VITE_AUTH_BACKEND_URL).');
    this.name = 'DealsUnavailableError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!USE_AUTH_BACKEND) throw new DealsUnavailableError();
  const res = await fetch(`${AUTH_BACKEND_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.detail || '';
    } catch {/*ignore*/}
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export async function listDeals(): Promise<Deal[]> {
  const res = await request<{ deals: Deal[] }>('/deals');
  return res.deals || [];
}

export type DealCreateInput = Partial<Omit<Deal, 'id' | 'created_at' | 'updated_at' | 'owner'>> & {
  type: DealType;
  address: string;
};

export async function createDeal(input: DealCreateInput): Promise<Deal> {
  const res = await request<{ deal: Deal }>('/deals', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.deal;
}

export async function updateDeal(id: string, patch: Partial<Deal>): Promise<Deal> {
  const res = await request<{ deal: Deal }>(`/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.deal;
}

export async function deleteDeal(id: string): Promise<void> {
  await request(`/deals/${id}`, { method: 'DELETE' });
}

/** Local search across address, contact, notes, tags. */
export function searchDeals(deals: Deal[], query: string): Deal[] {
  const q = query.trim().toLowerCase();
  if (!q) return deals;
  const terms = q.split(/\s+/).filter(Boolean);
  return deals.filter((d) => {
    const haystack = [
      d.address,
      d.contactName || '',
      d.contactEmail || '',
      d.contactPhone || '',
      d.notes || '',
      ...(d.tags || []),
    ].join(' ').toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
