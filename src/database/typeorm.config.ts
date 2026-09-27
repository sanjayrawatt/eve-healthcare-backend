import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Booking } from '../bookings/booking.entity';
import { CentreTest } from '../catalog/entities/centre-test.entity';
import { Centre } from '../catalog/entities/centre.entity';
import { DiagnosticTest } from '../catalog/entities/diagnostic-test.entity';
import { Payment } from '../payments/entities/payment.entity';
import { WebhookEvent } from '../payments/entities/webhook-event.entity';
import { User } from '../users/user.entity';

export const ENTITIES = [User, Centre, DiagnosticTest, CentreTest, Booking, Payment, WebhookEvent];

type EnvReader = (key: string) => string | number | undefined;

export function buildTypeOrmOptions(env: EnvReader): DataSourceOptions {
  return {
    type: 'postgres',
    host: String(env('DB_HOST')),
    port: Number(env('DB_PORT')),
    username: String(env('DB_USER')),
    password: String(env('DB_PASSWORD')),
    database: String(env('DB_NAME')),
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
  };
}
