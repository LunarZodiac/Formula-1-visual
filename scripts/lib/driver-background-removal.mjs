import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const workerPath = path.resolve(projectRoot, 'scripts', 'driver-background-worker.py');
const pythonCandidates = process.platform === 'win32'
  ? [
      process.env.DRIVER_BACKGROUND_PYTHON,
      path.resolve(projectRoot, 'scripts', '.venv-rembg', 'Scripts', 'python.exe'),
    ]
  : [
      process.env.DRIVER_BACKGROUND_PYTHON,
      path.resolve(projectRoot, 'scripts', '.venv-rembg', 'bin', 'python'),
    ];

let workerPromise;
let worker;
const pending = new Map();

async function existingPython() {
  for (const candidate of pythonCandidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('ISNet не установлен. Создайте scripts/.venv-rembg с Python 3.11–3.13 и установите scripts/requirements-rembg.txt');
}

function stopWithError(error) {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
  worker = undefined;
  workerPromise = undefined;
}

async function startWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const python = await existingPython();
    const child = spawn(python, ['-u', workerPath], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'inherit'],
      windowsHide: true,
    });
    worker = child;
    const lines = createInterface({ input: child.stdout });
    return await new Promise((resolve, reject) => {
      const startupTimeout = setTimeout(() => reject(new Error('Локальный обработчик ISNet не запустился за 15 секунд')), 15_000);
      const fail = (error) => {
        clearTimeout(startupTimeout);
        reject(error);
        stopWithError(error);
      };
      child.once('error', fail);
      child.once('exit', (code) => {
        const error = new Error(`Локальный обработчик ISNet завершился с кодом ${code ?? 'unknown'}`);
        if (pending.size) stopWithError(error);
        worker = undefined;
        workerPromise = undefined;
      });
      lines.on('line', (line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.type === 'ready') {
          clearTimeout(startupTimeout);
          resolve(child);
          return;
        }
        if (message.type === 'startup-error') {
          fail(new Error(`ISNet недоступен: ${message.error}`));
          return;
        }
        if (message.type === 'result') {
          const request = pending.get(message.id);
          if (!request) return;
          pending.delete(message.id);
          if (message.ok) request.resolve();
          else request.reject(new Error(`ISNet не обработал фотографию: ${message.error}`));
        }
      });
    });
  })();
  return workerPromise;
}

export async function removeDriverBackground(buffer) {
  const child = await startWorker();
  const directory = await mkdtemp(path.join(tmpdir(), 'f1-driver-background-'));
  const inputPath = path.join(directory, 'input-image');
  const outputPath = path.join(directory, 'output.png');
  const id = randomUUID();
  try {
    await writeFile(inputPath, buffer);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error('ISNet не завершил обработку за 3 минуты'));
      }, 180_000);
      pending.set(id, {
        resolve: () => { clearTimeout(timeout); resolve(); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
      child.stdin.write(`${JSON.stringify({ id, inputPath, outputPath })}\n`, (error) => {
        if (!error) return;
        const request = pending.get(id);
        pending.delete(id);
        request?.reject(error);
      });
    });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function closeDriverBackgroundWorker() {
  if (worker && !worker.killed) worker.kill();
}
