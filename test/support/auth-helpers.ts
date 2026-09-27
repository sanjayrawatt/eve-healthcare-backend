import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User, UserRole } from '../../src/users/user.entity';

let counter = 0;

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export async function signupUser(
  app: INestApplication,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<TestUser> {
  counter += 1;
  const body = {
    name: 'Test User',
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'Password123',
    ...overrides,
  };
  const res = await request(app.getHttpServer()).post('/auth/signup').send(body).expect(201);
  return { id: res.body.user.id, email: res.body.user.email, token: res.body.accessToken };
}

export async function createAdmin(app: INestApplication): Promise<TestUser> {
  const password = 'Password123';
  const user = await signupUser(app, { password });
  await app.get(DataSource).getRepository(User).update(user.id, { role: UserRole.ADMIN });
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: user.email, password })
    .expect(200);
  return { ...user, token: res.body.accessToken };
}

export const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
