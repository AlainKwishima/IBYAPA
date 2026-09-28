import { API_BASE_URL } from '../config/api';
import type { ContentLanguageCode } from '../context/AppFlowContext';
import type { SubscriptionType } from './api/subscriptionTypes';

export type BackendPricingMatrix = {
  rw: Partial<Record<SubscriptionType, number>>;
  en_fr: Partial<Record<SubscriptionType, number>>;
};

export type LiveSubscriptionPlan = {
  subscriptionType: SubscriptionType;
  amountRwf: number;
};

const PLAN_ORDER: SubscriptionType[] = ['monthly', 'two-weekly', 'weekly', 'daily', 'five-exams', 'two-exams'];

const FALLBACK_PRICING_MATRIX: BackendPricingMatrix = {
  rw: {
    'five-exams': 500,
    daily: 2000,
    weekly: 5000,
    'two-weekly': 8000,
    monthly: 10000,
  },
  en_fr: {
    'five-exams': 1000,
    daily: 2000,
    weekly: 6000,
    'two-weekly': 10000,
    monthly: 15000,
  },
};

function backendBaseUrl(): string {
  return API_BASE_URL.replace(/\/+$/, '');
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/javascript,text/javascript,*/*',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch backend asset (${res.status})`);
  }
  return res.text();
}

function extractFirstScriptSrc(html: string): string | null {
  const matches = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/gi)];
  if (matches.length === 0) return null;
  const preferred = matches.find((m) => /\/js\/index-[^/]+\.js$/i.test(m[1]));
  return (preferred?.[1] ?? matches[0][1] ?? null)?.trim() ?? null;
}

function extractPaymentChunkSrc(bundle: string): string | null {
  const match = bundle.match(/\/js\/PaymentPage-[A-Za-z0-9_-]+\.js/);
  return match?.[0] ?? null;
}

function extractBalancedObjectLiteral(source: string, anchorIndex: number): string | null {
  const start = source.indexOf('{', anchorIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringQuote = ch;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parsePricingMatrix(chunkSource: string): BackendPricingMatrix {
  const rwMarker = chunkSource.indexOf('rw:{');
  if (rwMarker < 0) {
    throw new Error('Backend pricing matrix not found');
  }

  const constMarker = chunkSource.lastIndexOf('const', rwMarker);
  const anchor = constMarker >= 0 ? constMarker : rwMarker;
  const literal = extractBalancedObjectLiteral(chunkSource, anchor);
  if (!literal) {
    throw new Error('Backend pricing object could not be parsed');
  }

  const value = new Function(`return (${literal});`)() as unknown;
  if (!value || typeof value !== 'object') {
    throw new Error('Backend pricing object invalid');
  }

  const matrix = value as BackendPricingMatrix;
  return {
    rw: matrix.rw ?? {},
    en_fr: matrix.en_fr ?? {},
  };
}

export async function fetchBackendPricingMatrix(): Promise<BackendPricingMatrix> {
  try {
    const html = await fetchText(`${backendBaseUrl()}/`);
    const scriptSrc = extractFirstScriptSrc(html);
    if (!scriptSrc) {
      throw new Error('Backend script not found');
    }

    const indexBundle = await fetchText(scriptSrc.startsWith('http') ? scriptSrc : `${backendBaseUrl()}${scriptSrc.startsWith('/') ? '' : '/'}${scriptSrc}`);
    const paymentChunkSrc = extractPaymentChunkSrc(indexBundle);
    if (!paymentChunkSrc) {
      throw new Error('Payment pricing chunk not found');
    }

    const paymentChunk = await fetchText(paymentChunkSrc.startsWith('http') ? paymentChunkSrc : `${backendBaseUrl()}${paymentChunkSrc.startsWith('/') ? '' : '/'}${paymentChunkSrc}`);
    return parsePricingMatrix(paymentChunk);
  } catch {
    // Web previews can be blocked by cross-origin restrictions when the app is served from localhost.
    // Fall back to the last confirmed live matrix so the UI still renders pricing instead of failing.
    return FALLBACK_PRICING_MATRIX;
  }
}

function languageBucket(lang: ContentLanguageCode): keyof BackendPricingMatrix {
  return lang === 'rw' ? 'rw' : 'en_fr';
}

export async function fetchLiveSubscriptionPlans(
  contentLanguage: ContentLanguageCode,
): Promise<LiveSubscriptionPlan[]> {
  const matrix = await fetchBackendPricingMatrix();
  const bucket = matrix[languageBucket(contentLanguage)];
  return PLAN_ORDER.filter((subscriptionType) => !(contentLanguage === 'rw' && subscriptionType === 'two-exams')).map((subscriptionType) => {
    const amountRwf = bucket[subscriptionType];
    if (typeof amountRwf !== 'number' || !Number.isFinite(amountRwf) || amountRwf <= 0) {
      return null;
    }
    return { subscriptionType, amountRwf };
  }).filter((item): item is LiveSubscriptionPlan => item !== null);
}
