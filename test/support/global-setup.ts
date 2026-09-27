import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';

export default function globalSetup() {
  const root = resolve(__dirname, '../..');
  const env = config({ path: resolve(root, '.env.test'), override: true, quiet: true }).parsed;
  const opts = { cwd: root, env: { ...process.env, ...env }, stdio: 'pipe' as const };

  execSync('npm run typeorm -- schema:drop', opts);
  execSync('npm run migration:run', opts);
}
