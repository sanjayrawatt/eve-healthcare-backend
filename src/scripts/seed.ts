import * as bcrypt from 'bcryptjs';
import { EntityManager } from 'typeorm';
import { CentreTest } from '../catalog/entities/centre-test.entity';
import { Centre } from '../catalog/entities/centre.entity';
import { DiagnosticTest } from '../catalog/entities/diagnostic-test.entity';
import dataSource from '../database/data-source';
import { User, UserRole } from '../users/user.entity';

const USERS = [
  { name: 'Admin', email: 'admin@eve.local', password: 'Admin12345', role: UserRole.ADMIN },
  { name: 'Demo Patient', email: 'patient@eve.local', password: 'Patient12345', role: UserRole.USER },
];

const TESTS = [
  { name: 'Complete Blood Count (CBC)', description: 'Red cells, white cells, haemoglobin and platelets.' },
  { name: 'Lipid Profile', description: 'Cholesterol and triglycerides.' },
  { name: 'Thyroid Profile (T3, T4, TSH)', description: 'Thyroid function.' },
  { name: 'HbA1c', description: 'Average blood sugar over three months.' },
  { name: 'Vitamin D (25-OH)', description: 'Vitamin D level.' },
];

const CENTRES = [
  {
    name: 'EVE Diagnostics — Cyber City',
    address: 'DLF Cyber City, Phase 2',
    city: 'Gurugram',
    prices: { 'Complete Blood Count (CBC)': 350, 'Lipid Profile': 600, HbA1c: 450, 'Vitamin D (25-OH)': 1200 },
  },
  {
    name: 'EVE Diagnostics — Connaught Place',
    address: 'Block A, Connaught Place',
    city: 'New Delhi',
    prices: { 'Complete Blood Count (CBC)': 300, 'Thyroid Profile (T3, T4, TSH)': 550, 'Lipid Profile': 650 },
  },
  {
    name: 'EVE Diagnostics — Indiranagar',
    address: '100 Feet Road, Indiranagar',
    city: 'Bengaluru',
    prices: { 'Complete Blood Count (CBC)': 320, HbA1c: 500, 'Vitamin D (25-OH)': 1100 },
  },
];

async function findOrCreate<T extends object>(
  manager: EntityManager,
  entity: new () => T,
  where: Partial<T>,
  data: Partial<T>,
): Promise<T> {
  const existing = await manager.findOneBy(entity, where as never);
  return existing ?? manager.save(manager.create(entity, { ...where, ...data } as never));
}

async function seed() {
  await dataSource.initialize();
  await dataSource.transaction(async (manager) => {
    for (const u of USERS) {
      await findOrCreate(manager, User, { email: u.email }, {
        name: u.name,
        role: u.role,
        passwordHash: await bcrypt.hash(u.password, 10),
      });
    }

    const tests = new Map<string, DiagnosticTest>();
    for (const t of TESTS) {
      tests.set(t.name, await findOrCreate(manager, DiagnosticTest, { name: t.name }, t));
    }

    for (const c of CENTRES) {
      const centre = await findOrCreate(manager, Centre, { name: c.name, city: c.city }, {
        address: c.address,
      });
      for (const [testName, price] of Object.entries(c.prices)) {
        await findOrCreate(
          manager,
          CentreTest,
          { centreId: centre.id, testId: tests.get(testName)!.id },
          { price },
        );
      }
    }
  });
  await dataSource.destroy();

  console.log('Seed complete.');
  for (const u of USERS) console.log(`  ${u.role.padEnd(5)} ${u.email} / ${u.password}`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
