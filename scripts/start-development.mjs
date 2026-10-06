import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, 'apps', 'web');
const databaseEnvironment = resolve(root, '.env.database.local');
const mediaEnvironment = resolve(root, '.env.media.local');
const adminEnvironment = resolve(web, '.dev.vars');

const bridge = spawn(process.execPath, [
  '--watch',
  `--env-file=${databaseEnvironment}`,
  `--env-file=${mediaEnvironment}`,
  `--env-file=${adminEnvironment}`,
  resolve(root, 'scripts', 'admin-database-server.mjs'),
], { cwd: root, stdio: 'inherit' });

const site = process.platform === 'win32'
  ? spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd run dev:web'], { cwd: web, stdio: 'inherit' })
  : spawn('pnpm', ['run', 'dev:web'], { cwd: web, stdio: 'inherit' });

let closing = false;
function shutdown(exitCode = 0) {
  if (closing) return;
  closing = true;
  if (!bridge.killed) bridge.kill('SIGTERM');
  if (!site.killed) site.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 250);
}

bridge.once('exit', (code) => { if (!closing) shutdown(code ?? 1); });
site.once('exit', (code) => { if (!closing) shutdown(code ?? 0); });
process.once('SIGINT', () => shutdown());
process.once('SIGTERM', () => shutdown());
