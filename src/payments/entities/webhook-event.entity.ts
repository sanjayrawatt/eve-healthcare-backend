import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Payment } from './payment.entity';

export enum WebhookEventOutcome {
  APPLIED = 'APPLIED',
  IGNORED = 'IGNORED',
}

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  eventId: string;

  @Column({ length: 50 })
  eventType: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment: Payment | null;

  @Column({ type: 'jsonb' })
  payload: object;

  @Column({
    type: 'enum',
    enum: WebhookEventOutcome,
    enumName: 'webhook_event_outcome',
    nullable: true,
  })
  outcome: WebhookEventOutcome | null;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;
}
