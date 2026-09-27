import Redis from 'ioredis';
import { CacheService } from './cache.service';

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    incr: jest.fn(async (k: string) => {
      const next = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(next));
      return next;
    }),
  };
}

describe('CacheService', () => {
  it('loads once, then serves from cache with the TTL applied', async () => {
    const redis = fakeRedis();
    const cache = new CacheService(redis as unknown as Redis);
    const load = jest.fn().mockResolvedValue({ n: 1 });

    expect(await cache.getOrSet('ns', 'k', 60, load)).toEqual({ n: 1 });
    expect(await cache.getOrSet('ns', 'k', 60, load)).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('ns:v0:k', '{"n":1}', 'EX', 60);
  });

  it('invalidate() makes the next read go to the loader again', async () => {
    const cache = new CacheService(fakeRedis() as unknown as Redis);
    const load = jest.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');

    await cache.getOrSet('ns', 'k', 60, load);
    await cache.invalidate('ns');
    expect(await cache.getOrSet('ns', 'k', 60, load)).toBe('new');
  });

  it('falls back to the loader when Redis is unavailable', async () => {
    const down = new Error('connection refused');
    const redis = {
      get: jest.fn().mockRejectedValue(down),
      set: jest.fn().mockRejectedValue(down),
      incr: jest.fn().mockRejectedValue(down),
    };
    const cache = new CacheService(redis as unknown as Redis);

    expect(await cache.getOrSet('ns', 'k', 60, async () => 'from-db')).toBe('from-db');
    await expect(cache.invalidate('ns')).resolves.toBeUndefined();
  });
});
