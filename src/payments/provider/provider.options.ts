export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';

export const PROVIDER_OPTIONS = Symbol('PROVIDER_OPTIONS');

export interface ProviderOptions {
  enabled: boolean;
  delayMs: number;
  deliveryUrl: string;
  secret: string;
  attempts: number;
  backoffMs: number;
}

export interface WebhookDeliveryJob {
  eventId: string;
  eventType: 'payment.succeeded' | 'payment.failed';
  transactionId: string;
  amount: number;
  failureReason?: string;
}
