import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SimulatedOutcome, SIMULATED_OUTCOMES } from '../payment-simulator';

export class CreatePaymentDto {
  @IsUUID()
  bookingId: string;

  @IsOptional()
  @IsIn(SIMULATED_OUTCOMES)
  simulateOutcome?: SimulatedOutcome;
}

export const WEBHOOK_EVENT_TYPES = ['payment.succeeded', 'payment.failed'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export class WebhookPaymentDataDto {
  @IsString()
  @MaxLength(64)
  transactionId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  failureReason?: string;
}

export class PaymentWebhookDto {
  @Matches(/^[A-Za-z0-9_-]{1,100}$/, { message: 'eventId must be 1-100 letters, digits, _ or -' })
  eventId: string;

  @IsIn(WEBHOOK_EVENT_TYPES)
  eventType: WebhookEventType;

  @IsOptional()
  @IsISO8601()
  createdAt?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => WebhookPaymentDataDto)
  data: WebhookPaymentDataDto;
}
