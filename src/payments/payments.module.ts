import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { PaymentSimulator } from './payment-simulator';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PROVIDER_OPTIONS, ProviderOptions, WEBHOOK_DELIVERY_QUEUE } from './provider/provider.options';
import { SimulatedProvider } from './provider/simulated-provider.service';
import { WebhookDeliveryProcessor } from './provider/webhook-delivery.processor';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, WebhookEvent]),
    BullModule.registerQueue({ name: WEBHOOK_DELIVERY_QUEUE }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    WebhooksService,
    PaymentSimulator,
    WebhookSignatureGuard,
    SimulatedProvider,
    WebhookDeliveryProcessor,
    {
      provide: PROVIDER_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ProviderOptions => ({
        enabled: config.getOrThrow<boolean>('PROVIDER_WEBHOOKS_ENABLED'),
        delayMs: config.getOrThrow<number>('PROVIDER_WEBHOOK_DELAY_MS'),
        deliveryUrl: config.getOrThrow<string>('WEBHOOK_DELIVERY_URL'),
        secret: config.getOrThrow<string>('WEBHOOK_SECRET'),
        attempts: 5,
        backoffMs: 1000,
      }),
    },
  ],
})
export class PaymentsModule {}
