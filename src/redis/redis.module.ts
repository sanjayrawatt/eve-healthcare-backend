import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS } from './redis.constants';

export function redisOptionsFromUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    db: Number(parsed.pathname.replace('/', '') || 0),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const client = new Redis({
          ...redisOptionsFromUrl(config.getOrThrow<string>('REDIS_URL')),
          maxRetriesPerRequest: 1,
        });
        const logger = new Logger('Redis');
        client.on('error', (error) => logger.warn(`Redis connection error: ${error.message}`));
        return client;
      },
    },
    CacheService,
  ],
  exports: [REDIS, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
