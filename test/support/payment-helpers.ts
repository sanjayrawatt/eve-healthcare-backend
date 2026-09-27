import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Payment } from '../../src/payments/entities/payment.entity';
import { WebhookEvent } from '../../src/payments/entities/webhook-event.entity';
import {
  SIGNATURE_HEADER,
  signWebhook,
  TIMESTAMP_HEADER,
} from '../../src/payments/webhook-signature';
import { bearer, TestUser } from './auth-helpers';

export function pay(
  app: INestApplication,
  user: TestUser,
  bookingId: string,
  simulateOutcome?: 'SUCCESS' | 'FAILED' | 'PENDING',
) {
  return request(app.getHttpServer())
    .post('/payments')
    .set(bearer(user))
    .send({ bookingId, ...(simulateOutcome && { simulateOutcome }) });
}

let eventCounter = 0;
export const newEventId = () => `evt_test_${Date.now()}_${++eventCounter}`;

export function webhookBody(
  eventType: 'payment.succeeded' | 'payment.failed',
  transactionId: string,
  amount: number,
  eventId = newEventId(),
) {
  return { eventId, eventType, data: { transactionId, amount } };
}

export function sendWebhook(
  app: INestApplication,
  body: object | string,
  opts: { secret?: string; timestamp?: number; signature?: string; path?: string } = {},
) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = opts.secret ?? process.env.WEBHOOK_SECRET!;
  return request(app.getHttpServer())
    .post(opts.path ?? '/payments/webhook')
    .set('Content-Type', 'application/json')
    .set(TIMESTAMP_HEADER, String(timestamp))
    .set(SIGNATURE_HEADER, opts.signature ?? signWebhook(secret, timestamp, raw))
    .send(raw);
}

export const countPayments = (app: INestApplication) =>
  app.get(DataSource).getRepository(Payment).count();

export const countWebhookEvents = (app: INestApplication) =>
  app.get(DataSource).getRepository(WebhookEvent).count();
