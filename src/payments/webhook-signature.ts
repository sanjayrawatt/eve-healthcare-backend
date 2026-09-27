import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'x-webhook-signature';
export const TIMESTAMP_HEADER = 'x-webhook-timestamp';

export function signWebhook(secret: string, timestamp: number, rawBody: string | Buffer): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

export type SignatureCheck = { valid: true } | { valid: false; reason: string };

export function verifyWebhookSignature(params: {
  secret: string;
  rawBody: Buffer | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  toleranceSeconds: number;
  nowSeconds?: number;
}): SignatureCheck {
  const { secret, rawBody, signature, timestamp, toleranceSeconds } = params;
  if (!rawBody || !signature || !timestamp) {
    return { valid: false, reason: 'Missing webhook signature headers' };
  }

  const sentAt = Number(timestamp);
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(sentAt) || Math.abs(now - sentAt) > toleranceSeconds) {
    return { valid: false, reason: 'Webhook timestamp is missing or too old' };
  }

  const expected = Buffer.from(signWebhook(secret, sentAt, rawBody));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { valid: false, reason: 'Invalid webhook signature' };
  }
  return { valid: true };
}
