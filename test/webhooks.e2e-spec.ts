import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { WebhookEvent } from '../src/payments/entities/webhook-event.entity';
import { signWebhook } from '../src/payments/webhook-signature';
import { bearer, createAdmin, signupUser, TestUser } from './support/auth-helpers';
import { createBooking } from './support/booking-helpers';
import { seedBookableTest } from './support/catalog-helpers';
import {
  countPayments,
  countWebhookEvents,
  pay,
  sendWebhook,
  webhookBody,
} from './support/payment-helpers';
import { createTestApp, resetDatabase } from './support/test-app';

describe('POST /payments/webhook (e2e)', () => {
  let app: INestApplication;
  let alice: TestUser;
  let bookingId: string;
  let transactionId: string;
  const amount = 750;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const admin = await createAdmin(app);
    alice = await signupUser(app);
    const slot = await seedBookableTest(app, admin, amount);
    bookingId = (await createBooking(app, alice, slot)).id;
    transactionId = (await pay(app, alice, bookingId, 'PENDING').expect(201)).body.transactionId;
  });

  afterAll(async () => {
    await app.close();
  });

  const state = async () => {
    const res = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set(bearer(alice))
      .expect(200);
    const payments = await app.get(DataSource).query(`SELECT status FROM payments`);
    return { booking: res.body.status, payment: payments[0].status };
  };

  describe('applying payment results', () => {
    it('payment.succeeded confirms the booking and records the event', async () => {
      const body = webhookBody('payment.succeeded', transactionId, amount);
      const res = await sendWebhook(app, body).expect(200);

      expect(res.body).toEqual({
        received: true,
        duplicate: false,
        outcome: 'APPLIED',
        paymentStatus: 'SUCCESS',
      });
      expect(await state()).toEqual({ booking: 'CONFIRMED', payment: 'SUCCESS' });

      const event = await app.get(DataSource).getRepository(WebhookEvent).findOneByOrFail({ eventId: body.eventId });
      expect(event).toMatchObject({ eventType: 'payment.succeeded', outcome: 'APPLIED' });
      expect(event.paymentId).toEqual(expect.any(String));
    });

    it('payment.failed fails the booking', async () => {
      await sendWebhook(app, webhookBody('payment.failed', transactionId, amount)).expect(200);
      expect(await state()).toEqual({ booking: 'FAILED', payment: 'FAILED' });
    });

    it('also works with the trailing-slash path from the spec', async () => {
      const body = webhookBody('payment.succeeded', transactionId, amount);
      await sendWebhook(app, body, { path: '/payments/webhook/' }).expect(200);
      expect(await state()).toEqual({ booking: 'CONFIRMED', payment: 'SUCCESS' });
    });
  });

  describe('idempotency', () => {
    it('the same event delivered again is acknowledged but changes nothing', async () => {
      const body = webhookBody('payment.succeeded', transactionId, amount);
      await sendWebhook(app, body).expect(200);

      const repeat = await sendWebhook(app, body).expect(200);
      expect(repeat.body).toEqual({ received: true, duplicate: true });
      expect(await countWebhookEvents(app)).toBe(1);
      expect(await countPayments(app)).toBe(1);
      expect(await state()).toEqual({ booking: 'CONFIRMED', payment: 'SUCCESS' });
    });

    it('the same event delivered 5 times at once is applied exactly once', async () => {
      const body = webhookBody('payment.succeeded', transactionId, amount);
      const responses = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(app, body)));

      expect(responses.every((r) => r.status === 200)).toBe(true);
      expect(responses.filter((r) => r.body.duplicate === false)).toHaveLength(1);
      expect(responses.filter((r) => r.body.duplicate === true)).toHaveLength(4);
      expect(await countWebhookEvents(app)).toBe(1);
      expect(await state()).toEqual({ booking: 'CONFIRMED', payment: 'SUCCESS' });
    });

    it('a late, conflicting event cannot flip a final state (success then failed)', async () => {
      await sendWebhook(app, webhookBody('payment.succeeded', transactionId, amount)).expect(200);
      const late = await sendWebhook(app, webhookBody('payment.failed', transactionId, amount)).expect(200);

      expect(late.body).toMatchObject({ duplicate: false, outcome: 'IGNORED', paymentStatus: 'SUCCESS' });
      expect(await state()).toEqual({ booking: 'CONFIRMED', payment: 'SUCCESS' });
    });

    it('conflicting events racing each other: exactly one wins, and the state is consistent', async () => {
      const [a, b] = await Promise.all([
        sendWebhook(app, webhookBody('payment.succeeded', transactionId, amount)),
        sendWebhook(app, webhookBody('payment.failed', transactionId, amount)),
      ]);
      expect([a.body.outcome, b.body.outcome].sort()).toEqual(['APPLIED', 'IGNORED']);

      const { booking, payment } = await state();
      expect([['CONFIRMED', 'SUCCESS'], ['FAILED', 'FAILED']]).toContainEqual([booking, payment]);
    });

    it('a webhook for a payment already settled by POST /payments is ignored', async () => {
      await resetDatabase(app);
      const admin = await createAdmin(app);
      alice = await signupUser(app);
      const slot = await seedBookableTest(app, admin, amount);
      bookingId = (await createBooking(app, alice, slot)).id;
      const paid = await pay(app, alice, bookingId, 'SUCCESS').expect(201);

      const res = await sendWebhook(app, webhookBody('payment.succeeded', paid.body.transactionId, amount)).expect(200);
      expect(res.body.outcome).toBe('IGNORED');
      expect(await state()).toEqual({ booking: 'CONFIRMED', payment: 'SUCCESS' });
    });
  });

  describe('booking cancelled while the payment was in flight', () => {
    it('records the payment as SUCCESS but keeps the booking CANCELLED', async () => {
      await request(app.getHttpServer())
        .patch(`/bookings/${bookingId}/cancel`)
        .set(bearer(alice))
        .expect(200);

      await sendWebhook(app, webhookBody('payment.succeeded', transactionId, amount)).expect(200);
      expect(await state()).toEqual({ booking: 'CANCELLED', payment: 'SUCCESS' });
    });
  });

  describe('rejected webhooks', () => {
    it('unknown transactionId returns 404 and does not store the event, so a retry can succeed', async () => {
      const body = webhookBody('payment.succeeded', 'txn_does_not_exist', amount);
      await sendWebhook(app, body).expect(404);
      expect(await countWebhookEvents(app)).toBe(0);
    });

    it('amount mismatch returns 422 and changes nothing', async () => {
      await sendWebhook(app, webhookBody('payment.succeeded', transactionId, 1)).expect(422);
      expect(await countWebhookEvents(app)).toBe(0);
      expect(await state()).toEqual({ booking: 'PENDING', payment: 'PENDING' });
    });

    it.each([
      ['an unknown eventType', { eventType: 'payment.refunded' }],
      ['a missing data block', { data: undefined }],
      ['a bad eventId', { eventId: 'has spaces!' }],
    ])('rejects %s with 400', async (_label, override) => {
      const body = { ...webhookBody('payment.succeeded', transactionId, amount), ...override };
      await sendWebhook(app, body).expect(400);
    });
  });

  describe('signature verification', () => {
    const body = () => webhookBody('payment.succeeded', transactionId, amount);

    it('rejects a request signed with the wrong secret', async () => {
      const res = await sendWebhook(app, body(), { secret: 'not-the-real-secret-123' }).expect(401);
      expect(res.body.message).toBe('Invalid webhook signature');
    });

    it('rejects a body that was changed after signing', async () => {
      const original = JSON.stringify(body());
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signWebhook(process.env.WEBHOOK_SECRET!, timestamp, original);
      const tampered = original.replace('"amount":750', '"amount":1');

      await sendWebhook(app, tampered, { timestamp, signature }).expect(401);
    });

    it('rejects an old (replayed) timestamp', async () => {
      const res = await sendWebhook(app, body(), { timestamp: Math.floor(Date.now() / 1000) - 3600 }).expect(401);
      expect(res.body.message).toBe('Webhook timestamp is missing or too old');
    });

    it('rejects a request with no signature headers', async () => {
      await request(app.getHttpServer()).post('/payments/webhook').send(body()).expect(401);
    });

    it('nothing is stored or changed for rejected signatures', async () => {
      await sendWebhook(app, body(), { secret: 'not-the-real-secret-123' }).expect(401);
      expect(await countWebhookEvents(app)).toBe(0);
      expect(await state()).toEqual({ booking: 'PENDING', payment: 'PENDING' });
    });
  });
});
