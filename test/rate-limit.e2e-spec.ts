import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/test-app';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  const original = process.env.AUTH_RATE_LIMIT_PER_MINUTE;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '3';
    app = await createTestApp();
  });

  afterAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = original;
    await app.close();
  });

  it('returns 429 after too many login attempts, without affecting other routes', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'someone@example.com', password: 'WrongPass123' });

    for (let i = 0; i < 3; i++) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(blocked.body).toMatchObject({ statusCode: 429, error: 'Too Many Requests' });
    expect(blocked.headers['retry-after']).toBeDefined();

    await request(app.getHttpServer()).get('/centres').expect(200);
  });
});
