import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Centre } from '../src/catalog/entities/centre.entity';
import { createAdmin, TestUser } from './support/auth-helpers';
import { createCentre, createTest, offerTest } from './support/catalog-helpers';
import { createTestApp, resetDatabase } from './support/test-app';

describe('Catalogue caching (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await createAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves repeat reads from Redis and refreshes after a write through the API', async () => {
    const centre = await createCentre(app, admin, { name: 'Original Name' });
    const get = () => request(app.getHttpServer()).get(`/centres/${centre.id}`).expect(200);

    expect((await get()).body.name).toBe('Original Name');

    await app.get(DataSource).getRepository(Centre).update(centre.id, { name: 'Changed In DB' });
    expect((await get()).body.name).toBe('Original Name');

    const test = await createTest(app, admin, 'CBC');
    await offerTest(app, admin, centre.id, test.id, 400);

    const fresh = (await get()).body;
    expect(fresh.name).toBe('Changed In DB');
    expect(fresh.tests).toEqual([expect.objectContaining({ name: 'CBC', price: 400 })]);
  });

  it('caches list pages per query, and a new centre shows up immediately', async () => {
    await createCentre(app, admin, { name: 'A Centre', city: 'Gurugram' });
    const list = (q: string) => request(app.getHttpServer()).get(`/centres${q}`).expect(200);

    expect((await list('?city=Gurugram')).body.meta.total).toBe(1);
    await createCentre(app, admin, { name: 'B Centre', city: 'Gurugram' });
    expect((await list('?city=Gurugram')).body.meta.total).toBe(2);
  });
});
