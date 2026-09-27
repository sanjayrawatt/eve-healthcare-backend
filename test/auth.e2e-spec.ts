import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, resetDatabase } from './support/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const valid = { name: 'Sanjay Rawat', email: 'Sanjay@Example.com', password: 'Password123' };

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST /auth/signup', () => {
    it('creates a user, returns a token, and never returns the password', async () => {
      const res = await http().post('/auth/signup').send(valid).expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ name: 'Sanjay Rawat', email: 'sanjay@example.com', role: 'USER' });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    it('rejects a duplicate email, case-insensitively, with 409', async () => {
      await http().post('/auth/signup').send(valid).expect(201);
      const res = await http()
        .post('/auth/signup')
        .send({ ...valid, email: 'SANJAY@example.com' })
        .expect(409);
      expect(res.body.message).toBe('An account with this email already exists');
    });

    it.each([
      ['invalid email', { ...valid, email: 'not-an-email' }],
      ['short password', { ...valid, password: 'Ab1' }],
      ['password without a number', { ...valid, password: 'PasswordOnly' }],
      ['missing name', { email: valid.email, password: valid.password }],
      ['bad phone', { ...valid, phone: '12' }],
      ['unknown field', { ...valid, role: 'ADMIN' }],
    ])('rejects %s with 400', async (_label, body) => {
      const res = await http().post('/auth/signup').send(body).expect(400);
      expect(res.body.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await http().post('/auth/signup').send(valid).expect(201);
    });

    it('returns a token for correct credentials (email is case-insensitive)', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: 'SANJAY@EXAMPLE.COM', password: valid.password })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe('sanjay@example.com');
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrongPassword = await http()
        .post('/auth/login')
        .send({ email: valid.email, password: 'WrongPass123' })
        .expect(401);
      const unknownEmail = await http()
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPass123' })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid email or password');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user for a valid token', async () => {
      const signup = await http().post('/auth/signup').send(valid).expect(201);
      const res = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${signup.body.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(signup.body.user.id);
    });

    it.each([
      ['no header', undefined],
      ['wrong scheme', 'Basic abc'],
      ['garbage token', 'Bearer not.a.jwt'],
    ])('returns 401 with %s', async (_label, header) => {
      const req = http().get('/auth/me');
      if (header) req.set('Authorization', header);
      const res = await req.expect(401);
      expect(res.body.message).toBe('Missing or invalid access token');
    });
  });
});
