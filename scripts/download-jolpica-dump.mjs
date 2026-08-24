#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import AdmZip from "adm-zip";

const OVERVIEW_URL = "https://api.jolpi.ca/data/dumps/download/";
const USER_AGENT = "F1-Geovisual-Atlas/0.1 dump-importer";
const DEFAULT_OUTPUT_DIRECTORY = path.resolve("tmp", "jolpica-dump", "downloaded");
const MAX_ATTEMPTS = 3;

function outputDirectory(argv) {
  const inline = argv.find((argument) => argument.startsWith("--output="));
  return path.resolve(inline?.split("=")[1] || DEFAULT_OUTPUT_DIRECTORY);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetries(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${url}`);
      }
      lastError = new Error(`HTTP ${response.status}: ${url}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < MAX_ATTEMPTS) await wait(1000 * 2 ** (attempt - 1));
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Не удалось получить ${url} после ${MAX_ATTEMPTS} попыток: ${message}`);
}

async function fetchJson(url) {
  return (await fetchWithRetries(url)).json();
}

async function downloadFile(url, destination) {
  const response = await fetchWithRetries(url);
  if (!response.body) throw new Error("Ответ с архивом не содержит данных.");
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function sha256(filename) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filename), hash);
  return hash.digest("hex");
}

function safeEntryPath(destination, entryName) {
  const normalized = path.normalize(entryName).replace(/^([/\\])+/, "");
  const resolved = path.resolve(destination, normalized);
  const root = `${path.resolve(destination)}${path.sep}`;
  if (!resolved.startsWith(root)) {
    throw new Error(`Небезопасный путь внутри ZIP: ${entryName}`);
  }
  return resolved;
}

async function extractArchive(archivePath, destination) {
  const zip = new AdmZip(archivePath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const target = safeEntryPath(destination, entry.entryName);
    await mkdir(path.dirname(target), { recursive: true });
    const extracted = zip.extractEntryTo(entry, path.dirname(target), false, true);
    if (!extracted) throw new Error(`Не удалось распаковать ${entry.entryName}.`);
  }
}

try {
  const destinationRoot = outputDirectory(process.argv.slice(2));
  await mkdir(destinationRoot, { recursive: true });

  const overview = await fetchJson(OVERVIEW_URL);
  const dump = overview?.delayed_dumps?.csv;
  if (!dump?.download_url || !dump?.file_hash || !dump?.uploaded_at) {
    throw new Error("Jolpica не вернула сведения о бесплатной CSV-выгрузке.");
  }

  const date = dump.uploaded_at.slice(0, 10);
  const archivePath = path.join(destinationRoot, `jolpica-${date}.zip`);
  const extractedPath = path.join(destinationRoot, `jolpica-${date}`);

  let actualHash;
  try {
    actualHash = await sha256(archivePath);
  } catch {
    actualHash = null;
  }

  if (actualHash === dump.file_hash.toLowerCase()) {
    console.log(`Используется уже скачанная выгрузка ${date}.`);
  } else {
    console.log(`Скачивание выгрузки ${date} (${dump.file_size} байт)...`);
    await downloadFile(dump.download_url, archivePath);
    actualHash = await sha256(archivePath);
  }

  if (actualHash !== dump.file_hash.toLowerCase()) {
    throw new Error(`SHA-256 не совпал: ожидался ${dump.file_hash}, получен ${actualHash}.`);
  }

  console.log("SHA-256 совпал. Распаковка...");
  await mkdir(extractedPath, { recursive: true });
  await extractArchive(archivePath, extractedPath);

  console.log(JSON.stringify({ archivePath, extractedPath, sha256: actualHash }, null, 2));
} catch (error) {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
