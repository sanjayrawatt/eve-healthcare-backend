import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BookingStatus } from '../src/bookings/booking-status';
import { CentreTest } from '../src/catalog/entities/centre-test.entity';
import { Centre } from '../src/catalog/entities/centre.entity';
import { bearer, createAdmin, signupUser, TestUser } from './support/auth-helpers';
import { createBooking, forceBooking, hoursFromNow } from './support/booking-helpers';
import { createTest, seedBookableTest } from './support/catalog-helpers';
import { createTestApp, resetDatabase } from './support/test-app';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let slot: { centreId: string; testId: string; price: number };

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await createAdmin(app);
    alice = await signupUser(app);
    bob = await signupUser(app);
    slot = await seedBookableTest(app, admin, 750);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const book = (user: TestUser, body: object) =>
    http().post('/bookings').set(bearer(user)).send(body);

  describe('POST /bookings', () => {
    it('creates a PENDING booking with the centre price as amount', async () => {
      const appointmentAt = hoursFromNow(24);
      const res = await book(alice, { centreId: slot.centreId, testId: slot.testId, appointmentAt }).expect(201);

      expect(res.body).toMatchObject({
        userId: alice.id,
        status: 'PENDING',
        amount: 750,
        appointmentAt,
        centre: { id: slot.centreId, name: 'Apollo Diagnostics' },
        test: { id: slot.testId, name: 'CBC' },
      });
    });

    it('requires authentication', async () => {
      await http().post('/bookings').send({}).expect(401);
    });

    it.each([
      ['a past date', () => ({ appointmentAt: hoursFromNow(-1) })],
      ['more than 90 days ahead', () => ({ appointmentAt: hoursFromNow(24 * 91) })],
      ['no timezone', () => ({ appointmentAt: '2030-01-01T10:00:00' })],
      ['a non-date', () => ({ appointmentAt: 'tomorrow' })],
      ['a malformed centreId', () => ({ centreId: 'abc' })],
    ])('rejects %s with 400', async (_label, override) => {
      await book(alice, {
        centreId: slot.centreId,
        testId: slot.testId,
        appointmentAt: hoursFromNow(24),
        ...override(),
      }).expect(400);
    });

    it('returns 404 for an unknown centre or a test the centre does not offer', async () => {
      const other = await createTest(app, admin, 'MRI');
      await book(alice, { centreId: UNKNOWN_ID, testId: slot.testId, appointmentAt: hoursFromNow(24) }).expect(404);
      const res = await book(alice, { centreId: slot.centreId, testId: other.id, appointmentAt: hoursFromNow(24) }).expect(404);
      expect(res.body.message).toBe('This test is not offered at this centre');
    });

    it('returns 404 when the test is marked unavailable at the centre', async () => {
      await app.get(DataSource).getRepository(CentreTest).update({ centreId: slot.centreId }, { isAvailable: false });
      await book(alice, { centreId: slot.centreId, testId: slot.testId, appointmentAt: hoursFromNow(24) }).expect(404);
    });

    it('returns 404 when the centre has been deactivated', async () => {
      await app.get(DataSource).getRepository(Centre).update(slot.centreId, { isActive: false });
      const res = await book(alice, { centreId: slot.centreId, testId: slot.testId, appointmentAt: hoursFromNow(24) }).expect(404);
      expect(res.body.message).toBe('Diagnostic centre not found');
    });

    it('blocks a duplicate live booking for the same slot, but allows it after cancelling', async () => {
      const appointmentAt = hoursFromNow(30);
      const first = await createBooking(app, alice, slot, appointmentAt);
      await book(alice, { centreId: slot.centreId, testId: slot.testId, appointmentAt }).expect(409);

      await http().patch(`/bookings/${first.id}/cancel`).set(bearer(alice)).expect(200);
      await createBooking(app, alice, slot, appointmentAt);
    });

    it('keeps the booked amount when the centre later changes its price', async () => {
      const booking = await createBooking(app, alice, slot);
      await app.get(DataSource).getRepository(CentreTest).update({ centreId: slot.centreId }, { price: 999 });

      const res = await http().get(`/bookings/${booking.id}`).set(bearer(alice)).expect(200);
      expect(res.body.amount).toBe(750);
    });
  });

  describe('reading bookings', () => {
    it('lists only the current user’s bookings, newest first, filterable by status', async () => {
      const a1 = await createBooking(app, alice, slot, hoursFromNow(10));
      const a2 = await createBooking(app, alice, slot, hoursFromNow(20));
      await createBooking(app, bob, slot, hoursFromNow(10));
      await forceBooking(app, a1.id, { status: BookingStatus.CONFIRMED });

      const all = await http().get('/bookings').set(bearer(alice)).expect(200);
      expect(all.body.data.map((b: { id: string }) => b.id)).toEqual([a2.id, a1.id]);
      expect(all.body.meta.total).toBe(2);

      const confirmed = await http().get('/bookings?status=CONFIRMED').set(bearer(alice)).expect(200);
      expect(confirmed.body.data.map((b: { id: string }) => b.id)).toEqual([a1.id]);

      await http().get('/bookings?status=BOGUS').set(bearer(alice)).expect(400);
    });

    it('returns 404 for another user’s booking and for unknown ids', async () => {
      const booking = await createBooking(app, alice, slot);
      await http().get(`/bookings/${booking.id}`).set(bearer(alice)).expect(200);
      await http().get(`/bookings/${booking.id}`).set(bearer(bob)).expect(404);
      await http().get(`/bookings/${UNKNOWN_ID}`).set(bearer(alice)).expect(404);
    });
  });

  describe('PATCH /bookings/:id/cancel', () => {
    const cancel = (user: TestUser, id: string) =>
      http().patch(`/bookings/${id}/cancel`).set(bearer(user));

    it('cancels a PENDING booking, and repeating the call is a harmless no-op', async () => {
      const booking = await createBooking(app, alice, slot);

      const first = await cancel(alice, booking.id).expect(200);
      expect(first.body.status).toBe('CANCELLED');
      expect(first.body.cancelledAt).toEqual(expect.any(String));

      const second = await cancel(alice, booking.id).expect(200);
      expect(second.body.status).toBe('CANCELLED');
      expect(second.body.cancelledAt).toBe(first.body.cancelledAt);
    });

    it('cancels a CONFIRMED booking before the appointment', async () => {
      const booking = await createBooking(app, alice, slot);
      await forceBooking(app, booking.id, { status: BookingStatus.CONFIRMED });
      const res = await cancel(alice, booking.id).expect(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('refuses to cancel a CONFIRMED booking after the appointment time', async () => {
      const booking = await createBooking(app, alice, slot);
      await forceBooking(app, booking.id, {
        status: BookingStatus.CONFIRMED,
        appointmentAt: new Date(Date.now() - 60_000),
      });
      await cancel(alice, booking.id).expect(409);
    });

    it('refuses to cancel a FAILED booking', async () => {
      const booking = await createBooking(app, alice, slot);
      await forceBooking(app, booking.id, { status: BookingStatus.FAILED });
      const res = await cancel(alice, booking.id).expect(409);
      expect(res.body.message).toBe('Booking cannot move from FAILED to CANCELLED');
    });

    it('does not let another user cancel the booking', async () => {
      const booking = await createBooking(app, alice, slot);
      await cancel(bob, booking.id).expect(404);
      const res = await http().get(`/bookings/${booking.id}`).set(bearer(alice)).expect(200);
      expect(res.body.status).toBe('PENDING');
    });
  });
});
