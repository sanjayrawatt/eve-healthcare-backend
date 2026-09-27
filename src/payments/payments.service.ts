import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Booking } from '../bookings/booking.entity';
import { BookingStatus, canTransition } from '../bookings/booking-status';
import { CreatePaymentDto } from './dto/payment.dto';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { WebhookEventOutcome } from './entities/webhook-event.entity';
import { PaymentSimulator } from './payment-simulator';
import { SimulatedProvider } from './provider/simulated-provider.service';

export type FinalPaymentStatus = PaymentStatus.SUCCESS | PaymentStatus.FAILED;

export interface PaymentResponse {
  id: string;
  bookingId: string;
  amount: number;
  status: PaymentStatus;
  transactionId: string;
  failureReason: string | null;
  bookingStatus: BookingStatus;
  createdAt: Date;
  updatedAt: Date;
}

function toPaymentResponse(payment: Payment): PaymentResponse {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    amount: payment.amount,
    status: payment.status,
    transactionId: payment.transactionId,
    failureReason: payment.failureReason,
    bookingStatus: payment.booking.status,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

const BOOKING_STATUS_FOR: Record<FinalPaymentStatus, BookingStatus> = {
  [PaymentStatus.SUCCESS]: BookingStatus.CONFIRMED,
  [PaymentStatus.FAILED]: BookingStatus.FAILED,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly simulator: PaymentSimulator,
    private readonly provider: SimulatedProvider,
  ) {}

  async create(
    userId: string,
    dto: CreatePaymentDto,
  ): Promise<{ payment: PaymentResponse; created: boolean }> {
    const { payment, created } = await this.dataSource.transaction(async (manager) => {
      const booking = await manager.findOne(Booking, {
        where: { id: dto.bookingId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const existing = await manager.findOneBy(Payment, { bookingId: booking.id });
      if (existing) {
        return { payment: existing, created: false };
      }
      if (booking.status !== BookingStatus.PENDING) {
        throw new ConflictException(`Booking is ${booking.status} and cannot be paid`);
      }
      if (booking.appointmentAt <= new Date()) {
        throw new ConflictException('Cannot pay for a booking after its appointment time');
      }

      const newPayment = await manager.save(
        manager.create(Payment, {
          bookingId: booking.id,
          amount: booking.amount,
          status: PaymentStatus.PENDING,
          transactionId: `txn_${randomUUID().replace(/-/g, '')}`,
        }),
      );
      return { payment: newPayment, created: true };
    });

    if (created) {
      const charge = this.simulator.charge(dto.simulateOutcome);
      if (charge.outcome === 'PENDING') {
        await this.scheduleProviderWebhook(payment);
      } else {
        const status = charge.outcome === 'SUCCESS' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
        await this.dataSource.transaction(async (manager) => {
          const locked = await manager.findOneOrFail(Payment, {
            where: { id: payment.id },
            lock: { mode: 'pessimistic_write' },
          });
          await this.applyOutcome(manager, locked, status, charge.failureReason);
        });
      }
    }

    return { payment: await this.get(userId, payment.id), created };
  }

  private async scheduleProviderWebhook(payment: Payment): Promise<void> {
    try {
      await this.provider.scheduleResult(payment);
    } catch (error) {
      this.logger.error(`Could not schedule provider webhook for ${payment.id}: ${(error as Error).message}`);
    }
  }

  async get(userId: string, id: string): Promise<PaymentResponse> {
    const payment = await this.dataSource.getRepository(Payment).findOne({
      where: { id, booking: { userId } },
      relations: { booking: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return toPaymentResponse(payment);
  }

  lockPaymentByTransactionId(manager: EntityManager, transactionId: string) {
    return manager.findOne(Payment, { where: { transactionId }, lock: { mode: 'pessimistic_write' } });
  }

  async applyOutcome(
    manager: EntityManager,
    payment: Payment,
    status: FinalPaymentStatus,
    failureReason?: string,
  ): Promise<WebhookEventOutcome> {
    if (payment.status !== PaymentStatus.PENDING) {
      if (payment.status !== status) {
        this.logger.warn(
          `Ignoring ${status} for payment ${payment.id}: it is already ${payment.status}`,
        );
      }
      return WebhookEventOutcome.IGNORED;
    }

    payment.status = status;
    payment.failureReason = status === PaymentStatus.FAILED ? (failureReason ?? 'Payment failed') : null;
    await manager.save(payment);

    const booking = await manager.findOneOrFail(Booking, {
      where: { id: payment.bookingId },
      lock: { mode: 'pessimistic_write' },
    });
    const target = BOOKING_STATUS_FOR[status];
    if (canTransition(booking.status, target)) {
      booking.status = target;
      await manager.save(booking);
    } else if (status === PaymentStatus.SUCCESS) {
      this.logger.warn(
        `Payment ${payment.id} succeeded but booking ${booking.id} is ${booking.status}: refund required`,
      );
    }
    return WebhookEventOutcome.APPLIED;
  }
}
