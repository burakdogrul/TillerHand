// Payment provider notification signatures (iyzico, PayTR). Verify before reading anything else from the request;
// an unverified notification is rejected. Steps and sources: docs/legal/turkiye.md → "Payment notifications".
// Sources (checked 2026-10-25): docs.iyzico.com/en/advanced/webhook · dev.paytr.com/en/iframe-api/iframe-api-2-adim
import { createHmac, timingSafeEqual } from 'node:crypto';

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const hmac = (key: string, text: string, encoding: 'hex' | 'base64'): string => createHmac('sha256', key).update(text).digest(encoding);
// Only non-empty strings and safe integers are signed values; anything else (missing, object, boolean) fails the check.
// iyziPaymentId is a JSON number (long): above 2^53 JSON.parse has already rounded it, so the id is wrong and is rejected.
// shortcut: such a notification is refused (ids are ~8 digits today); if ids near 2^53, read it with a JSON.parse reviver's context.source.
const text = (v: unknown): string | null => (typeof v === 'string' ? v || null : Number.isSafeInteger(v) ? String(v) : null);

const IYZICO_DIRECT = ['iyziEventType', 'paymentId', 'paymentConversationId', 'status'];
const IYZICO_CHECKOUT = ['iyziEventType', 'iyziPaymentId', 'token', 'paymentConversationId', 'status'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// A valid signature only proves the provider sent it: check the result field and the amount before confirming an order.

// iyzico: X-IYZ-SIGNATURE-V3 header = hex HMAC-SHA256, key secretKey, over secretKey + the fields above.
// Checkout form / Pay with iyzico notifications carry "token". Subscription notifications are not covered.
export function verifyIyzico(body: unknown, signature: string | null | undefined, secretKey: string): boolean {
  if (!secretKey || typeof signature !== 'string' || !signature || !isRecord(body)) return false;
  const values = ('token' in body ? IYZICO_CHECKOUT : IYZICO_DIRECT).map((f) => text(body[f]));
  if (values.includes(null)) return false;
  return same(hmac(secretKey, secretKey + values.join(''), 'hex'), signature.toLowerCase());
}

// PayTR callback: "hash" field = base64 HMAC-SHA256, key merchant_key, over merchant_oid + merchant_salt + status + total_amount.
// Reply with plain "OK" (also for repeats); apply only the first notification per merchant_oid.
export function verifyPaytr(fields: unknown, merchantKey: string, merchantSalt: string): boolean {
  if (!merchantKey || !merchantSalt || !isRecord(fields)) return false;
  const [oid, status, amount, hash] = ['merchant_oid', 'status', 'total_amount', 'hash'].map((f) => text(fields[f]));
  if (!oid || !status || !amount || !hash) return false;
  return same(hmac(merchantKey, oid + merchantSalt + status + amount, 'base64'), hash);
}
