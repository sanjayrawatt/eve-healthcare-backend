import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CentreTest } from './centre-test.entity';

@Entity('centres')
export class Centre {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 255 })
  address: string;

  @Index()
  @Column({ length: 100 })
  city: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => CentreTest, (centreTest) => centreTest.centre)
  centreTests: CentreTest[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
