import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getOrSet<T>(
    namespace: string,
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    let fullKey: string | undefined;
    try {
      const version = (await this.redis.get(`${namespace}:version`)) ?? '0';
      fullKey = `${namespace}:v${version}:${key}`;
      const cached = await this.redis.get(fullKey);
      if (cached !== null) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      this.logger.warn(`Cache read failed, using the database: ${(error as Error).message}`);
      return load();
    }

    const value = await load();
    try {
      await this.redis.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache write failed: ${(error as Error).message}`);
    }
    return value;
  }

  async invalidate(namespace: string): Promise<void> {
    try {
      await this.redis.incr(`${namespace}:version`);
    } catch (error) {
      this.logger.warn(`Cache invalidation failed: ${(error as Error).message}`);
    }
  }
}
