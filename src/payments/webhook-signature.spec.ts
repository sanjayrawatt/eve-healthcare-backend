import { signWebhook, verifyWebhookSignature } from './webhook-signature';

const secret = 'unit-test-secret-1234';
const body = '{"eventId":"evt_1"}';
const now = 1_800_000_000;

const check = (overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) =>
  verifyWebhookSignature({
    secret,
    rawBody: Buffer.from(body),
    signature: signWebhook(secret, now, body),
    timestamp: String(now),
    toleranceSeconds: 300,
    nowSeconds: now,
    ...overrides,
  });

describe('webhook signature', () => {
  it('accepts a correctly signed, fresh request', () => {
    expect(check()).toEqual({ valid: true });
  });

  it('accepts a timestamp inside the tolerance window', () => {
    expect(check({ nowSeconds: now + 300 }).valid).toBe(true);
  });

  it.each([
    ['a tampered body', { rawBody: Buffer.from('{"eventId":"evt_2"}') }],
    ['the wrong secret', { signature: signWebhook('another-secret-5678', now, body) }],
    ['a garbage signature', { signature: 'sha256=abc' }],
    ['a stale timestamp', { nowSeconds: now + 301 }],
    ['a future timestamp', { nowSeconds: now - 301 }],
    ['a non-numeric timestamp', { timestamp: 'yesterday' }],
    ['a missing signature', { signature: undefined }],
    ['a missing body', { rawBody: undefined }],
  ])('rejects %s', (_label, overrides) => {
    expect(check(overrides).valid).toBe(false);
  });
});
