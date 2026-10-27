// Payment notification attack test (tr addon). Run: node --test tests/security/payment-webhook.mjs (CI: payment-webhook)
// A forged, altered or unsigned notification must be rejected. If the check in src/lib/payments/webhook-signature.ts
// is removed or weakened, this goes red. Fake keys only; no provider account or secret is needed.
// Node 22.18+ runs the .ts module directly (type stripping).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyIyzico, verifyPaytr } from '../../src/lib/payments/webhook-signature.ts';

const SECRET = 'test-secret-key';
const KEY = 'test-merchant-key';
const SALT = 'test-merchant-salt';

const iyzicoSign = (b, secret = SECRET) => {
  const fields = 'token' in b ? [b.iyziEventType, b.iyziPaymentId, b.token, b.paymentConversationId, b.status] : [b.iyziEventType, b.paymentId, b.paymentConversationId, b.status];
  return createHmac('sha256', secret).update(secret + fields.join('')).digest('hex');
};
const paytrSign = (f, key = KEY, salt = SALT) => createHmac('sha256', key).update(f.merchant_oid + salt + f.status + f.total_amount).digest('base64');

const direct = { iyziEventType: 'API_AUTH', paymentId: '22416750', paymentConversationId: 'siparis-42', status: 'SUCCESS' };
const checkout = { iyziEventType: 'CHECKOUT_FORM_AUTH', iyziPaymentId: '22416751', token: 'tok-abc', paymentConversationId: 'siparis-43', status: 'SUCCESS' };
const paytr = { merchant_oid: 'SIP42', status: 'success', total_amount: '3456' };

test('iyzico: a correctly signed notification is accepted (direct and checkout form)', () => {
  assert.equal(verifyIyzico(direct, iyzicoSign(direct), SECRET), true);
  assert.equal(verifyIyzico(checkout, iyzicoSign(checkout), SECRET), true);
  assert.equal(verifyIyzico(direct, iyzicoSign(direct).toUpperCase(), SECRET), true, 'hex case does not matter');
  const numeric = { ...checkout, iyziPaymentId: 22416751 };
  assert.equal(verifyIyzico(numeric, iyzicoSign(numeric), SECRET), true, 'iyziPaymentId as a JSON number (long)');
});

test('iyzico: a payment id rounded by JSON.parse (above 2^53) is rejected', () => {
  const body = JSON.parse('{"iyziEventType":"CHECKOUT_FORM_AUTH","iyziPaymentId":9007199254740993,"token":"tok-abc","paymentConversationId":"siparis-43","status":"SUCCESS"}');
  const sent = { ...body, iyziPaymentId: '9007199254740993' };
  assert.equal(verifyIyzico(body, iyzicoSign(sent), SECRET), false);
  assert.equal(verifyIyzico(body, iyzicoSign(body), SECRET), false, 'even when signed over the rounded value');
});

test('iyzico: forged, altered or unsigned notifications are rejected', () => {
  const sig = iyzicoSign(direct);
  assert.equal(verifyIyzico({ ...direct, status: 'FAILURE' }, sig, SECRET), false, 'status changed after signing');
  assert.equal(verifyIyzico({ ...direct, paymentConversationId: 'siparis-99' }, sig, SECRET), false, 'order switched');
  assert.equal(verifyIyzico(direct, iyzicoSign(direct, 'attacker-key'), SECRET), false, 'signed with another key');
  assert.equal(verifyIyzico(direct, undefined, SECRET), false, 'no header');
  assert.equal(verifyIyzico(direct, '', SECRET), false, 'empty header');
  assert.equal(verifyIyzico(direct, sig.slice(0, 10), SECRET), false, 'short signature does not throw');
  assert.equal(verifyIyzico(direct, 'ğ'.repeat(64), SECRET), false, 'non-ASCII signature does not throw');
  assert.equal(verifyIyzico({ ...direct, status: undefined }, sig, SECRET), false, 'missing field');
  assert.equal(verifyIyzico(direct, sig, ''), false, 'no secret configured');
  for (const body of [null, 'x', 42, [direct]]) assert.equal(verifyIyzico(body, sig, SECRET), false, `broken body ${JSON.stringify(body)} does not throw`);
});

test('PayTR: a correctly hashed callback is accepted', () => {
  assert.equal(verifyPaytr({ ...paytr, hash: paytrSign(paytr) }, KEY, SALT), true);
  assert.equal(verifyPaytr({ ...paytr, total_amount: 3456, hash: paytrSign(paytr) }, KEY, SALT), true, 'number amount');
});

test('PayTR: forged, altered or unhashed callbacks are rejected', () => {
  const hash = paytrSign(paytr);
  assert.equal(verifyPaytr({ ...paytr, total_amount: '1', hash }, KEY, SALT), false, 'amount changed');
  assert.equal(verifyPaytr({ ...paytr, status: 'failed', hash: paytrSign(paytr) }, KEY, SALT), false, 'status changed');
  assert.equal(verifyPaytr({ ...paytr, hash: paytrSign(paytr, 'attacker-key') }, KEY, SALT), false, 'another key');
  assert.equal(verifyPaytr({ ...paytr, hash: paytrSign(paytr, KEY, 'other-salt') }, KEY, SALT), false, 'another salt');
  assert.equal(verifyPaytr(paytr, KEY, SALT), false, 'no hash');
  assert.equal(verifyPaytr({ ...paytr, hash: 'x' }, KEY, SALT), false, 'short hash does not throw');
  assert.equal(verifyPaytr({ ...paytr, hash }, '', SALT), false, 'no key configured');
  for (const body of [null, 'x', 42]) assert.equal(verifyPaytr(body, KEY, SALT), false, `broken body ${JSON.stringify(body)} does not throw`);
});
