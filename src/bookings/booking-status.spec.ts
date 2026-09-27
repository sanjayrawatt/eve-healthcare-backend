import { ConflictException } from '@nestjs/common';
import { assertTransition, BookingStatus, canTransition } from './booking-status';

const { PENDING, CONFIRMED, FAILED, CANCELLED } = BookingStatus;

describe('booking status transitions', () => {
  it.each([
    [PENDING, CONFIRMED],
    [PENDING, FAILED],
    [PENDING, CANCELLED],
    [CONFIRMED, CANCELLED],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    [CONFIRMED, FAILED],
    [CONFIRMED, PENDING],
    [FAILED, CONFIRMED],
    [FAILED, CANCELLED],
    [CANCELLED, CONFIRMED],
    [CANCELLED, PENDING],
    [PENDING, PENDING],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(ConflictException);
  });
});
