import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BookingStatus } from '../src/bookings/booking-status';
import { bearer, createAdmin, signupUser, TestUser } from './support/auth-helpers';
import { createBooking, forceBooking } from './support/booking-helpers';
import { seedBookableTest } from './support/catalog-helpers';
import { countPayments, pay } from './support/payment-helpers';
import { createTestApp, resetDatabase } from './support/test-app';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('POST /payments (e2e)', () => {
  let app: INestApplication;
  let alice: TestUser;
  let bob: TestUser;
  let bookingId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const admin = await createAdmin(app);
    alice = await signupUser(app);
    bob = await signupUser(app);
    const slot = await seedBookableTest(app, admin, 750);
    bookingId = (await createBooking(app, alice, slot)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const bookingStatus = async (user: TestUser, id: string) =>
    (await request(app.getHttpServer()).get(`/bookings/${id}`).set(bearer(user)).expect(200)).body
      .status;

  it('SUCCESS confirms the booking', async () => {
    const res = await pay(app, alice, bookingId, 'SUCCESS').expect(201);

    expect(res.body).toMatchObject({
      bookingId,
      amount: 750,
      status: 'SUCCESS',
      bookingStatus: 'CONFIRMED',
      failureReason: null,
    });
    expect(res.body.transactionId).toMatch(/^txn_[0-9a-f]{32}$/);
    expect(await bookingStatus(alice, bookingId)).toBe('CONFIRMED');
  });

  it('FAILED fails the booking and records a reason', async () => {
    const res = await pay(app, alice, bookingId, 'FAILED').expect(201);
    expect(res.body).toMatchObject({ status: 'FAILED', bookingStatus: 'FAILED' });
    expect(res.body.failureReason).toEqual(expect.any(String));
    expect(await bookingStatus(alice, bookingId)).toBe('FAILED');
  });

  it('with no forced outcome, the result is random but the booking always matches it', async () => {
    const res = await pay(app, alice, bookingId).expect(201);
    const expected = { SUCCESS: 'CONFIRMED', FAILED: 'FAILED' } as Record<string, string>;
    expect(['SUCCESS', 'FAILED']).toContain(res.body.status);
    expect(res.body.bookingStatus).toBe(expected[res.body.status]);
  });

  it('PENDING leaves both payment and booking pending until the webhook arrives', async () => {
    const res = await pay(app, alice, bookingId, 'PENDING').expect(201);
    expect(res.body).toMatchObject({ status: 'PENDING', bookingStatus: 'PENDING' });
  });

  it('a repeated request returns the existing payment (200) instead of charging again', async () => {
    const first = await pay(app, alice, bookingId, 'SUCCESS').expect(201);
    const second = await pay(app, alice, bookingId, 'FAILED').expect(200);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.status).toBe('SUCCESS');
    expect(await countPayments(app)).toBe(1);
  });

  it('concurrent requests for the same booking create exactly one payment', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => pay(app, alice, bookingId, 'SUCCESS')),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(await countPayments(app)).toBe(1);
  });

  it('returns 404 for another user’s booking or an unknown booking', async () => {
    await pay(app, bob, bookingId, 'SUCCESS').expect(404);
    await pay(app, alice, UNKNOWN_ID, 'SUCCESS').expect(404);
    expect(await countPayments(app)).toBe(0);
    expect(await bookingStatus(alice, bookingId)).toBe('PENDING');
  });

  it('rejects paying for a cancelled booking with 409', async () => {
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/cancel`)
      .set(bearer(alice))
      .expect(200);
    const res = await pay(app, alice, bookingId, 'SUCCESS').expect(409);
    expect(res.body.message).toBe('Booking is CANCELLED and cannot be paid');
  });

  it('rejects paying after the appointment time with 409', async () => {
    await forceBooking(app, bookingId, { appointmentAt: new Date(Date.now() - 60_000) });
    await pay(app, alice, bookingId, 'SUCCESS').expect(409);
  });

  it('rejects paying for a booking that is not PENDING', async () => {
    await forceBooking(app, bookingId, { status: BookingStatus.FAILED });
    await pay(app, alice, bookingId, 'SUCCESS').expect(409);
  });

  it.each([
    ['a malformed bookingId', { bookingId: 'abc' }],
    ['an unknown simulateOutcome', { simulateOutcome: 'MAYBE' }],
    ['an extra field', { amount: 1 }],
  ])('rejects %s with 400', async (_label, override) => {
    await request(app.getHttpServer())
      .post('/payments')
      .set(bearer(alice))
      .send({ bookingId, ...override })
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer()).post('/payments').send({ bookingId }).expect(401);
  });

  describe('GET /payments/:id', () => {
    it('returns the payment to its owner only', async () => {
      const created = await pay(app, alice, bookingId, 'SUCCESS').expect(201);
      const own = await request(app.getHttpServer())
        .get(`/payments/${created.body.id}`)
        .set(bearer(alice))
        .expect(200);
      expect(own.body).toEqual(created.body);

      await request(app.getHttpServer())
        .get(`/payments/${created.body.id}`)
        .set(bearer(bob))
        .expect(404);
    });
  });
});
