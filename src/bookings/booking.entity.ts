import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CentreTest } from '../catalog/entities/centre-test.entity';
import { decimalTransformer } from '../database/decimal.transformer';
import { User } from '../users/user.entity';
import { BookingStatus } from './booking-status';

@Entity('bookings')
@Index(['userId', 'createdAt'])
@Index('uq_bookings_active_slot', ['userId', 'centreTestId', 'appointmentAt'], {
  unique: true,
  where: `"status" IN ('PENDING', 'CONFIRMED')`,
})
@Check(`"amount" > 0`)
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('uuid')
  centreTestId: string;

  @ManyToOne(() => CentreTest, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centre_test_id' })
  centreTest: CentreTest;

  @Column({ type: 'timestamptz' })
  appointmentAt: Date;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  amount: number;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    enumName: 'booking_status',
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
