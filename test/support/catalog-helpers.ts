import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer, TestUser } from './auth-helpers';

export async function createCentre(
  app: INestApplication,
  admin: TestUser,
  overrides: Partial<{ name: string; address: string; city: string }> = {},
) {
  const res = await request(app.getHttpServer())
    .post('/centres')
    .set(bearer(admin))
    .send({ name: 'Apollo Diagnostics', address: 'MG Road', city: 'Gurugram', ...overrides })
    .expect(201);
  return res.body as { id: string; name: string; city: string };
}

export async function createTest(app: INestApplication, admin: TestUser, name = 'CBC') {
  const res = await request(app.getHttpServer())
    .post('/tests')
    .set(bearer(admin))
    .send({ name, description: `${name} description` })
    .expect(201);
  return res.body as { id: string; name: string };
}

export async function offerTest(
  app: INestApplication,
  admin: TestUser,
  centreId: string,
  testId: string,
  price = 500,
) {
  const res = await request(app.getHttpServer())
    .post(`/centres/${centreId}/tests`)
    .set(bearer(admin))
    .send({ testId, price })
    .expect(201);
  return res.body as { centreTestId: string; price: number };
}

export async function seedBookableTest(app: INestApplication, admin: TestUser, price = 500) {
  const centre = await createCentre(app, admin);
  const test = await createTest(app, admin);
  await offerTest(app, admin, centre.id, test.id, price);
  return { centreId: centre.id, testId: test.id, price };
}
