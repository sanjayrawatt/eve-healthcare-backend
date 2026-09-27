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
import { decimalTransformer } from '../../database/decimal.transformer';
import { Centre } from './centre.entity';
import { DiagnosticTest } from './diagnostic-test.entity';

@Entity('centre_tests')
@Index(['centreId', 'testId'], { unique: true })
@Check(`"price" > 0`)
export class CentreTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  centreId: string;

  @ManyToOne(() => Centre, (centre) => centre.centreTests, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'centre_id' })
  centre: Centre;

  @Index()
  @Column('uuid')
  testId: string;

  @ManyToOne(() => DiagnosticTest, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'test_id' })
  test: DiagnosticTest;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
  price: number;

  @Column({ default: true })
  isAvailable: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
