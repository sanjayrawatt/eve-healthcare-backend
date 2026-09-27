import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import { paginate, Paginated } from '../common/dto/pagination.dto';
import { isUniqueViolation } from '../database/pg-errors';
import { Booking } from './booking.entity';
import { assertTransition, BookingStatus } from './booking-status';
import { CreateBookingDto, ListBookingsQueryDto } from './dto/booking.dto';

const MAX_ADVANCE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BookingResponse {
  id: string;
  userId: string;
  status: BookingStatus;
  appointmentAt: Date;
  amount: number;
  centre: { id: string; name: string; address: string; city: string };
  test: { id: string; name: string };
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toBookingResponse(booking: Booking): BookingResponse {
  const { centre, test } = booking.centreTest;
  return {
    id: booking.id,
    userId: booking.userId,
    status: booking.status,
    appointmentAt: booking.appointmentAt,
    amount: booking.amount,
    centre: { id: centre.id, name: centre.name, address: centre.address, city: centre.city },
    test: { id: test.id, name: test.name },
    cancelledAt: booking.cancelledAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

const WITH_DETAILS = { centreTest: { centre: true, test: true } } as const;

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly catalog: CatalogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateBookingDto): Promise<BookingResponse> {
    const appointmentAt = new Date(dto.appointmentAt);
    const now = Date.now();
    if (appointmentAt.getTime() <= now) {
      throw new BadRequestException('appointmentAt must be in the future');
    }
    if (appointmentAt.getTime() > now + MAX_ADVANCE_DAYS * DAY_MS) {
      throw new BadRequestException(
        `appointmentAt must be within ${MAX_ADVANCE_DAYS} days from now`,
      );
    }

    const centreTest = await this.catalog.findBookableCentreTest(dto.centreId, dto.testId);

    try {
      const booking = await this.bookings.save(
        this.bookings.create({
          userId,
          centreTestId: centreTest.id,
          appointmentAt,
          amount: centreTest.price,
          status: BookingStatus.PENDING,
        }),
      );
      return toBookingResponse({ ...booking, centreTest });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('You already have a booking for this test at this time');
      }
      throw error;
    }
  }

  async list(userId: string, query: ListBookingsQueryDto): Promise<Paginated<BookingResponse>> {
    const [rows, total] = await this.bookings.findAndCount({
      where: { userId, ...(query.status && { status: query.status }) },
      relations: WITH_DETAILS,
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginate(rows.map(toBookingResponse), total, query);
  }

  async get(userId: string, id: string): Promise<BookingResponse> {
    return toBookingResponse(await this.findOwned(userId, id));
  }

  async cancel(userId: string, id: string): Promise<BookingResponse> {
    await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
      if (booking.status === BookingStatus.CANCELLED) {
        return;
      }
      if (booking.status === BookingStatus.CONFIRMED && booking.appointmentAt <= new Date()) {
        throw new ConflictException('Cannot cancel a booking after its appointment time');
      }
      assertTransition(booking.status, BookingStatus.CANCELLED);

      booking.status = BookingStatus.CANCELLED;
      booking.cancelledAt = new Date();
      await manager.save(booking);
    });
    return this.get(userId, id);
  }

  private async findOwned(userId: string, id: string): Promise<Booking> {
    const booking = await this.bookings.findOne({ where: { id, userId }, relations: WITH_DETAILS });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }
}
