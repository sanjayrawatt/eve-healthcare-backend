import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Booking } from '../../src/bookings/booking.entity';
import { BookingStatus } from '../../src/bookings/booking-status';
import { bearer, TestUser } from './auth-helpers';

const HOUR_MS = 60 * 60 * 1000;

export const hoursFromNow = (hours: number) =>
  new Date(Date.now() + hours * HOUR_MS).toISOString();

export async function createBooking(
  app: INestApplication,
  user: TestUser,
  slot: { centreId: string; testId: string },
  appointmentAt = hoursFromNow(48),
) {
  const res = await request(app.getHttpServer())
    .post('/bookings')
    .set(bearer(user))
    .send({ centreId: slot.centreId, testId: slot.testId, appointmentAt })
    .expect(201);
  return res.body as { id: string; amount: number; status: BookingStatus };
}

export async function forceBooking(
  app: INestApplication,
  id: string,
  changes: Partial<Pick<Booking, 'status' | 'appointmentAt'>>,
) {
  await app.get(DataSource).getRepository(Booking).update(id, changes);
}
