import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Centre } from '../src/catalog/entities/centre.entity';
import { bearer, createAdmin, signupUser, TestUser } from './support/auth-helpers';
import { createCentre, createTest, offerTest } from './support/catalog-helpers';
import { createTestApp, resetDatabase } from './support/test-app';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Centres & tests (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let user: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    admin = await createAdmin(app);
    user = await signupUser(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('authorization on write endpoints', () => {
    const centre = { name: 'Apollo', address: 'MG Road', city: 'Gurugram' };

    it('lets an admin create a centre', async () => {
      const res = await http().post('/centres').set(bearer(admin)).send(centre).expect(201);
      expect(res.body).toMatchObject({ ...centre, isActive: true });
    });

    it('returns 403 for a normal user', async () => {
      await http().post('/centres').set(bearer(user)).send(centre).expect(403);
      await http().post('/tests').set(bearer(user)).send({ name: 'CBC' }).expect(403);
    });

    it('returns 401 without a token', async () => {
      await http().post('/centres').send(centre).expect(401);
    });

    it('validates the body', async () => {
      await http().post('/centres').set(bearer(admin)).send({ name: 'A' }).expect(400);
    });
  });

  describe('tests catalogue', () => {
    it('rejects a duplicate test name, case-insensitively', async () => {
      await createTest(app, admin, 'Thyroid Panel');
      await http().post('/tests').set(bearer(admin)).send({ name: 'thyroid panel' }).expect(409);
    });

    it('lists tests with pagination and search', async () => {
      for (const name of ['CBC', 'Lipid Profile', 'Liver Function']) {
        await createTest(app, admin, name);
      }
      const page = await http().get('/tests?page=1&limit=2').expect(200);
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });

      const search = await http().get('/tests?search=li').expect(200);
      expect(search.body.data.map((t: { name: string }) => t.name)).toEqual([
        'Lipid Profile',
        'Liver Function',
      ]);
    });

    it('rejects invalid pagination', async () => {
      await http().get('/tests?limit=500').expect(400);
      await http().get('/tests?page=0').expect(400);
    });
  });

  describe('offering a test at a centre', () => {
    let centreId: string;
    let testId: string;

    beforeEach(async () => {
      centreId = (await createCentre(app, admin)).id;
      testId = (await createTest(app, admin)).id;
    });

    it('links a test with a price, returned as a number', async () => {
      const res = await offerTest(app, admin, centreId, testId, 499.5);
      expect(res).toMatchObject({ testId, name: 'CBC', price: 499.5 });
    });

    it('rejects linking the same test twice with 409', async () => {
      await offerTest(app, admin, centreId, testId);
      await http()
        .post(`/centres/${centreId}/tests`)
        .set(bearer(admin))
        .send({ testId, price: 600 })
        .expect(409);
    });

    it('returns 404 for an unknown centre or test', async () => {
      await http()
        .post(`/centres/${UNKNOWN_ID}/tests`)
        .set(bearer(admin))
        .send({ testId, price: 500 })
        .expect(404);
      await http()
        .post(`/centres/${centreId}/tests`)
        .set(bearer(admin))
        .send({ testId: UNKNOWN_ID, price: 500 })
        .expect(404);
    });

    it.each([[0], [-10], [10.555], ['500']])('rejects price %p with 400', async (price) => {
      await http()
        .post(`/centres/${centreId}/tests`)
        .set(bearer(admin))
        .send({ testId, price })
        .expect(400);
    });
  });

  describe('reading centres (public)', () => {
    it('GET /centres/:id returns the centre with its tests and prices', async () => {
      const centre = await createCentre(app, admin);
      const cbc = await createTest(app, admin, 'CBC');
      await offerTest(app, admin, centre.id, cbc.id, 350);

      const res = await http().get(`/centres/${centre.id}`).expect(200);
      expect(res.body).toMatchObject({ id: centre.id, name: 'Apollo Diagnostics', city: 'Gurugram' });
      expect(res.body.tests).toEqual([
        expect.objectContaining({ testId: cbc.id, name: 'CBC', price: 350 }),
      ]);

      const tests = await http().get(`/centres/${centre.id}/tests`).expect(200);
      expect(tests.body).toEqual(res.body.tests);
    });

    it('filters by city (case-insensitive) and by offered test', async () => {
      const gurugram = await createCentre(app, admin, { name: 'A Centre', city: 'Gurugram' });
      await createCentre(app, admin, { name: 'B Centre', city: 'Delhi' });
      const cbc = await createTest(app, admin, 'CBC');
      await offerTest(app, admin, gurugram.id, cbc.id);

      const byCity = await http().get('/centres?city=gurugram').expect(200);
      expect(byCity.body.data.map((c: Centre) => c.name)).toEqual(['A Centre']);

      const byTest = await http().get(`/centres?testId=${cbc.id}`).expect(200);
      expect(byTest.body.data.map((c: Centre) => c.id)).toEqual([gurugram.id]);
      expect(byTest.body.meta.total).toBe(1);
    });

    it('hides inactive centres', async () => {
      const centre = await createCentre(app, admin);
      await app.get(DataSource).getRepository(Centre).update(centre.id, { isActive: false });

      await http().get(`/centres/${centre.id}`).expect(404);
      const list = await http().get('/centres').expect(200);
      expect(list.body.data).toHaveLength(0);
    });

    it('returns 404 for an unknown centre and 400 for a malformed id', async () => {
      await http().get(`/centres/${UNKNOWN_ID}`).expect(404);
      await http().get('/centres/not-a-uuid').expect(400);
    });
  });
});
