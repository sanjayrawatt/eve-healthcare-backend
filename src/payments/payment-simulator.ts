import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const SIMULATED_OUTCOMES = ['SUCCESS', 'FAILED', 'PENDING'] as const;
export type SimulatedOutcome = (typeof SIMULATED_OUTCOMES)[number];

export interface SimulatedCharge {
  outcome: SimulatedOutcome;
  failureReason?: string;
}

@Injectable()
export class PaymentSimulator {
  constructor(private readonly config: ConfigService) {}

  charge(forced?: SimulatedOutcome): SimulatedCharge {
    const outcome = forced ?? this.randomOutcome();
    return outcome === 'FAILED' ? { outcome, failureReason: 'Card declined (simulated)' } : { outcome };
  }

  private randomOutcome(): SimulatedOutcome {
    const successRate = this.config.getOrThrow<number>('PAYMENT_SUCCESS_RATE');
    return Math.random() < successRate ? 'SUCCESS' : 'FAILED';
  }
}
