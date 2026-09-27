import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { parseArgs } from 'util';
import { signWebhook, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../payments/webhook-signature';

config({ quiet: true });

const { values } = parseArgs({
  options: {
    transaction: { type: 'string' },
    amount: { type: 'string' },
    type: { type: 'string', default: 'payment.succeeded' },
    event: { type: 'string' },
    url: { type: 'string', default: `http://localhost:${process.env.PORT ?? 3000}/payments/webhook` },
  },
});

async function main() {
  if (!values.transaction || !values.amount) {
    console.error('Usage: npm run webhook:send -- --transaction <txn_id> --amount <amount> [--type payment.failed] [--event <id>]');
    process.exit(1);
  }
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error('WEBHOOK_SECRET is not set (see .env)');
    process.exit(1);
  }

  const body = JSON.stringify({
    eventId: values.event ?? `evt_${randomUUID().replace(/-/g, '')}`,
    eventType: values.type,
    createdAt: new Date().toISOString(),
    data: { transactionId: values.transaction, amount: Number(values.amount) },
  });
  const timestamp = Math.floor(Date.now() / 1000);

  const res = await fetch(values.url!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [TIMESTAMP_HEADER]: String(timestamp),
      [SIGNATURE_HEADER]: signWebhook(secret, timestamp, body),
    },
    body,
  });

  console.log(`> POST ${values.url}\n> ${body}\n< ${res.status} ${await res.text()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
