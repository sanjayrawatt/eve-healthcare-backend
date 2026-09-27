import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DB_HOST: string;

  @IsInt()
  DB_PORT: number;

  @IsString()
  DB_USER: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET: string;

  @IsInt()
  @Min(60)
  JWT_EXPIRES_IN_SECONDS: number = 3600;

  @IsString()
  @MinLength(16)
  WEBHOOK_SECRET: string;

  @IsInt()
  @Min(1)
  WEBHOOK_TOLERANCE_SECONDS: number = 300;

  @IsNumber()
  @Min(0)
  @Max(1)
  PAYMENT_SUCCESS_RATE: number = 0.7;

  @IsInt()
  @Min(1)
  RATE_LIMIT_PER_MINUTE: number = 100;

  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT_PER_MINUTE: number = 10;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL: string = 'info';

  @IsString()
  REDIS_URL: string;

  @IsInt()
  @Min(1)
  CATALOG_CACHE_TTL_SECONDS: number = 60;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  PROVIDER_WEBHOOKS_ENABLED: boolean = true;

  @IsInt()
  @Min(0)
  PROVIDER_WEBHOOK_DELAY_MS: number = 3000;

  @IsString()
  WEBHOOK_DELIVERY_URL: string = 'http://localhost:3000/payments/webhook';
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  return validated;
}
