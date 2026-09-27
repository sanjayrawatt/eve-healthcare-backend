import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentWebhookDto } from './dto/payment.dto';
import { PaymentStatus } from './entities/payment.entity';
import { WebhookEvent, WebhookEventOutcome } from './entities/webhook-event.entity';
import { PaymentsService } from './payments.service';

export interface WebhookResult {
  received: true;
  duplicate: boolean;
  outcome?: WebhookEventOutcome;
  paymentStatus?: PaymentStatus;
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly payments: PaymentsService,
  ) {}

  async handle(dto: PaymentWebhookDto): Promise<WebhookResult> {
    return this.dataSource.transaction(async (manager) => {
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(WebhookEvent)
        .values({
          eventId: dto.eventId,
          eventType: dto.eventType,
          payload: dto,
        })
        .orIgnore()
        .returning(['id'])
        .execute();

      if (inserted.raw.length === 0) {
        return { received: true, duplicate: true };
      }
      const eventRowId: string = inserted.raw[0].id;

      const payment = await this.payments.lockPaymentByTransactionId(
        manager,
        dto.data.transactionId,
      );
      if (!payment) {
        throw new NotFoundException('Unknown transactionId');
      }
      if (payment.amount !== dto.data.amount) {
        throw new UnprocessableEntityException('Webhook amount does not match the payment');
      }

      const status =
        dto.eventType === 'payment.succeeded' ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
      const outcome = await this.payments.applyOutcome(
        manager,
        payment,
        status,
        dto.data.failureReason,
      );

      await manager.update(WebhookEvent, { id: eventRowId }, { paymentId: payment.id, outcome });
      return { received: true, duplicate: false, outcome, paymentStatus: payment.status };
    });
  }
}
