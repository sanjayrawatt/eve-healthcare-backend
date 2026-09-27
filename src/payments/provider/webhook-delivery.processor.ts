import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SIGNATURE_HEADER, signWebhook, TIMESTAMP_HEADER } from '../webhook-signature';
import {
  PROVIDER_OPTIONS,
  ProviderOptions,
  WEBHOOK_DELIVERY_QUEUE,
  WebhookDeliveryJob,
} from './provider.options';

const REQUEST_TIMEOUT_MS = 5000;

@Processor(WEBHOOK_DELIVERY_QUEUE)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(@Inject(PROVIDER_OPTIONS) private readonly options: ProviderOptions) {
    super();
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { eventId, eventType, transactionId, amount, failureReason } = job.data;
    const body = JSON.stringify({
      eventId,
      eventType,
      data: { transactionId, amount, ...(failureReason && { failureReason }) },
    });
    const timestamp = Math.floor(Date.now() / 1000);

    const res = await fetch(this.options.deliveryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signWebhook(this.options.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Webhook ${eventId} rejected with HTTP ${res.status}`);
    }
    this.logger.log(`Delivered webhook ${eventId} (${eventType}) on attempt ${job.attemptsMade + 1}`);
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`Webhook delivery worker error: ${error.message}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookDeliveryJob>, error: Error) {
    this.logger.warn(
      `Webhook ${job.data.eventId} attempt ${job.attemptsMade}/${job.opts.attempts} failed: ${error.message}`,
    );
  }
}
