import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { PROVIDER_OPTIONS, ProviderOptions } from '../src/payments/provider/provider.options';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../src/payments/webhook-signature';
import { bearer, createAdmin, signupUser, TestUser } from './support/auth-helpers';
import { createBooking } from './support/booking-helpers';
import { seedBookableTest } from './support/catalog-helpers';
import { countWebhookEvents, pay } from './support/payment-helpers';
import { createTestApp, resetDatabase } from './support/test-app';

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });

async function waitFor(check: () => Promise<boolean>, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting for condition');
}

describe('Simulated provider: background webhook delivery with retries (e2e)', () => {
  let app: INestApplication;
  let proxy: Server;
  let webhookUrl = '';
  let alice: TestUser;
  let bookingId: string;

  let deliveries: string[] = [];
  let failBeforeForwarding = 0;
  let failAfterForwarding = 0;

  beforeAll(async () => {
    proxy = createServer(async (req, res) => {
      const body = await readBody(req);
      deliveries.push(JSON.parse(body).eventId);

      if (failBeforeForwarding > 0) {
        failBeforeForwarding--;
        res.writeHead(503).end();
        return;
      }
      const forwarded = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [TIMESTAMP_HEADER]: String(req.headers[TIMESTAMP_HEADER]),
          [SIGNATURE_HEADER]: String(req.headers[SIGNATURE_HEADER]),
        },
        body,
      });
      if (failAfterForwarding > 0) {
        failAfterForwarding--;
        res.writeHead(500).end();
        return;
      }
      res.writeHead(forwarded.status).end(await forwarded.text());
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const proxyPort = (proxy.address() as AddressInfo).port;

    const options: ProviderOptions = {
      enabled: true,
      delayMs: 0,
      deliveryUrl: `http://127.0.0.1:${proxyPort}/payments/webhook`,
      secret: process.env.WEBHOOK_SECRET!,
      attempts: 5,
      backoffMs: 50,
    };
    app = await createTestApp((b) => b.overrideProvider(PROVIDER_OPTIONS).useValue(options));
    webhookUrl = `${await app.getUrl()}/payments/webhook`;
  });

  beforeEach(async () => {
    await resetDatabase(app);
    deliveries = [];
    failBeforeForwarding = 0;
    failAfterForwarding = 0;
    const admin = await createAdmin(app);
    alice = await signupUser(app);
    const slot = await seedBookableTest(app, admin, 500);
    bookingId = (await createBooking(app, alice, slot)).id;
  });

  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => proxy.close(resolve));
  });

  const bookingStatus = async () =>
    (await request(app.getHttpServer()).get(`/bookings/${bookingId}`).set(bearer(alice))).body
      .status as string;
  const settled = async () => (await bookingStatus()) !== 'PENDING';

  it('a PENDING payment is settled by the provider webhook in the background', async () => {
    const res = await pay(app, alice, bookingId, 'PENDING').expect(201);
    expect(res.body.bookingStatus).toBe('PENDING');

    await waitFor(settled);
    expect(['CONFIRMED', 'FAILED']).toContain(await bookingStatus());
    expect(deliveries).toHaveLength(1);
    expect(await countWebhookEvents(app)).toBe(1);
  });

  it('retries with backoff when our endpoint is unavailable, re-sending the same eventId', async () => {
    failBeforeForwarding = 2;
    await pay(app, alice, bookingId, 'PENDING').expect(201);

    await waitFor(settled);
    expect(deliveries).toHaveLength(3);
    expect(new Set(deliveries).size).toBe(1);
    expect(await countWebhookEvents(app)).toBe(1);
  });

  it('when our acknowledgement is lost, the retry is recognised as a duplicate', async () => {
    failAfterForwarding = 1;
    await pay(app, alice, bookingId, 'PENDING').expect(201);

    await waitFor(async () => deliveries.length >= 2);
    await waitFor(settled);
    expect(new Set(deliveries).size).toBe(1);
    expect(await countWebhookEvents(app)).toBe(1);
  });
});
