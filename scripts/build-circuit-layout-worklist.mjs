import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const auditPath = resolve(root, 'data/review/historical-layout-audit.json');
const outputPath = resolve(root, 'docs/plans/circuit-layout-digitisation-worklist.md');
const audit = JSON.parse(await readFile(auditPath, 'utf8'));
const circuits = audit.priorityQueue;

const withoutInventory = circuits.filter((circuit) => circuit.databaseLayouts === 0);
const knownRuntimePeriods = withoutInventory.filter((circuit) => circuit.runtimeHistoricalPeriods.length > 0);
const periodResearchRequired = withoutInventory.filter((circuit) => circuit.runtimeHistoricalPeriods.length === 0);
const missingGeometry = circuits.flatMap((circuit) => circuit.layoutInventory
  .filter((layout) => !layout.hasGeometry)
  .map((layout) => ({ circuit, layout })));
const singleLayoutResearch = circuits.filter((circuit) => (
  circuit.databaseLayouts === 1
  && circuit.raceCount > 1
  && circuit.runtimeHistoricalPeriods.length === 0
));

const rows = [];
rows.push('# Рабочий список конфигураций трасс');
rows.push('');
rows.push(`Сформировано: ${new Date().toISOString().slice(0, 10)} из \`data/review/historical-layout-audit.json\``);
rows.push('');
rows.push('Это не утверждение, что каждой трассе обязательно нужна новая линия. Сначала проверяется уже существующая runtime-геометрия; ручная оцифровка нужна только при отсутствии подходящего контура или при подтверждённом историческом изменении.');
rows.push('');
rows.push('## Сводка');
rows.push('');
rows.push(`- Трасс в аудите: ${audit.summary.circuits}`);
rows.push(`- Трасс без инвентаря конфигураций в PostgreSQL: ${withoutInventory.length}`);
rows.push(`- Уже заведённых конфигураций без геометрии: ${missingGeometry.length}`);
rows.push(`- Трасс с известными в runtime историческими периодами: ${knownRuntimePeriods.length}`);
rows.push(`- Трасс без формализованных периодов, требующих исследования: ${periodResearchRequired.length}`);
rows.push(`- Трасс с одной записью при нескольких этапах, требующих проверки исторических изменений: ${singleLayoutResearch.length}`);
rows.push('');
rows.push('## 1. Конфигурации уже заведены, но контуры отсутствуют');
rows.push('');
rows.push('| Трасса | ID конфигурации | Период | Длина |');
rows.push('|---|---|---:|---:|');
for (const { circuit, layout } of missingGeometry) {
  const period = layout.validFromYear === layout.validToYear
    ? String(layout.validFromYear ?? 'не указан')
    : `${layout.validFromYear ?? '?'}–${layout.validToYear ?? 'н.в.'}`;
  rows.push(`| ${circuit.name} (\`${circuit.circuitId}\`) | \`${layout.id}\` | ${period} | ${layout.lengthM ? `${layout.lengthM} м` : '—'} |`);
}
rows.push('');
rows.push('## 2. Конфигурации известны в runtime, но ещё не перенесены в PostgreSQL');
rows.push('');
rows.push('Эти линии следует сначала проверить и импортировать из существующего реестра. Повторная ручная оцифровка до проверки не нужна.');
rows.push('');
rows.push('| Трасса | Сезоны F1 | Конфигурации/периоды |');
rows.push('|---|---|---|');
for (const circuit of knownRuntimePeriods) {
  const periods = circuit.runtimeHistoricalPeriods
    .map((period) => `\`${period.geometryId}\` — ${period.from}–${period.to}: ${period.label}`)
    .join('<br>');
  rows.push(`| ${circuit.name} (\`${circuit.circuitId}\`) | ${circuit.seasons} | ${periods} |`);
}
rows.push('');
rows.push('## 3. Инвентарь отсутствует, периоды ещё не формализованы');
rows.push('');
rows.push('Для каждой строки нужно: проверить runtime-контур, определить реальные периоды изменений по источникам, затем решить — импортировать имеющуюся линию или оцифровать дополнительные версии.');
rows.push('');
rows.push('| Приоритет | Трасса | Сезоны F1 | Этапов | Runtime-контур |');
rows.push('|---:|---|---|---:|---|');
periodResearchRequired.forEach((circuit, index) => {
  rows.push(`| ${index + 1} | ${circuit.name} (\`${circuit.circuitId}\`) | ${circuit.seasons} | ${circuit.raceCount} | \`${circuit.runtimeDefaultGeometryId ?? 'нет'}\` |`);
});
rows.push('');
rows.push('## 4. Одна конфигурация в базе — требуется проверка исторических изменений');
rows.push('');
rows.push('Наличие одной современной линии не доказывает, что она подходит всем сезонам. Это очередь исследования, а не автоматическое требование рисовать новую конфигурацию.');
rows.push('');
rows.push('| Трасса | Сезоны F1 | Этапов | Текущая запись |');
rows.push('|---|---|---:|---|');
for (const circuit of singleLayoutResearch) {
  rows.push(`| ${circuit.name} (\`${circuit.circuitId}\`) | ${circuit.seasons} | ${circuit.raceCount} | \`${circuit.layoutInventory[0]?.id ?? '—'}\` |`);
}
rows.push('');
rows.push('## Рекомендуемый порядок');
rows.push('');
rows.push('1. Владелец проекта оцифровывает девять отсутствующих контуров Спа и проверяет их на реальных ориентирах');
rows.push('2. Проверить импортированные runtime-линии и повышать статус с `candidate` только после подтверждения происхождения и исторического периода');
rows.push('3. Исследовать реальные изменения трасс с одной базовой записью по числу проведённых этапов: Монца, Монако, Сильверстоун, Нюрбургринг, Хоккенхайм, Имола и далее');
rows.push('4. После подтверждения периодов собирать лицензированные схемы в \`local-reference/circuit-layouts/<circuit-id>/\`, оцифровывать только отсутствующие линии и затем назначать их этапам');
rows.push('');

await writeFile(outputPath, `${rows.join('\n')}\n`, 'utf8');
console.log(outputPath);
