#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse";

const REQUIRED_FILES = [
  "formula_one_circuit.csv",
  "formula_one_driver.csv",
  "formula_one_driverchampionship.csv",
  "formula_one_round.csv",
  "formula_one_roundentry.csv",
  "formula_one_season.csv",
  "formula_one_session.csv",
  "formula_one_sessionentry.csv",
  "formula_one_team.csv",
  "formula_one_teamchampionship.csv",
  "formula_one_teamdriver.csv",
];

function inputDirectory(argv) {
  const inline = argv.find((argument) => argument.startsWith("--directory="));
  const separateIndex = argv.indexOf("--directory");
  const value = inline?.split("=")[1] ?? argv[separateIndex + 1];
  if (!value) {
    throw new Error("Укажите распакованную папку через --directory <путь>.");
  }
  return path.resolve(value);
}

async function inspectCsv(filename) {
  let rows = 0;
  let columns = [];
  const parser = createReadStream(filename).pipe(
    parse({ columns: true, bom: true, relax_column_count: false, skip_empty_lines: true }),
  );

  for await (const row of parser) {
    if (columns.length === 0) columns = Object.keys(row);
    rows += 1;
  }
  return { rows, columns };
}

try {
  const directory = inputDirectory(process.argv.slice(2));
  const filenames = (await readdir(directory)).filter((name) => name.endsWith(".csv")).sort();
  const missing = REQUIRED_FILES.filter((filename) => !filenames.includes(filename));
  if (missing.length > 0) {
    throw new Error(`В архиве отсутствуют обязательные файлы: ${missing.join(", ")}`);
  }

  const tables = {};
  for (const filename of filenames) {
    process.stdout.write(`Проверка ${filename}... `);
    tables[filename] = await inspectCsv(path.join(directory, filename));
    console.log(`${tables[filename].rows} строк`);
  }

  console.log("\nСтруктура CSV корректна:");
  console.log(JSON.stringify({ directory, files: filenames.length, tables }, null, 2));
} catch (error) {
  console.error(`\nОшибка: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
