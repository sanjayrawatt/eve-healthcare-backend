const MINUTE_MS = 60_000;

export const AUTH_RATE_LIMIT = {
  default: {
    ttl: MINUTE_MS,
    limit: () => Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10),
  },
};

export const DEFAULT_RATE_LIMIT_TTL_MS = MINUTE_MS;
