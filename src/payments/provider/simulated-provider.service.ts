import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PaymentSimulator } from '../payment-simulator';
import {
  PROVIDER_OPTIONS,
  ProviderOptions,
  WEBHOOK_DELIVERY_QUEUE,
  WebhookDeliveryJob,
} from './provider.options';

@Injectable()
export class SimulatedProvider implements OnModuleInit {
  private readonly logger = new Logger(SimulatedProvider.name);

  constructor(
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly queue: Queue<WebhookDeliveryJob>,
    @Inject(PROVIDER_OPTIONS) private readonly options: ProviderOptions,
    private readonly simulator: PaymentSimulator,
  ) {}

  onModuleInit() {
    this.queue.on('error', (error) => this.logger.error(`Webhook queue error: ${error.message}`));
  }

  async scheduleResult(payment: { transactionId: string; amount: number }): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    const charge = this.simulator.charge();
    const eventId = `evt_${randomUUID().replace(/-/g, '')}`;
    await this.queue.add(
      'deliver',
      {
        eventId,
        eventType: charge.outcome === 'SUCCESS' ? 'payment.succeeded' : 'payment.failed',
        transactionId: payment.transactionId,
        amount: payment.amount,
        failureReason: charge.failureReason,
      },
      {
        jobId: eventId,
        delay: this.options.delayMs,
        attempts: this.options.attempts,
        backoff: { type: 'exponential', delay: this.options.backoffMs },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }
}
