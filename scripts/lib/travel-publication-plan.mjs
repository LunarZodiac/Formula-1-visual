const circuitIdPattern = /^[A-Za-z0-9_-]+$/;

export function parsePublicationArgs(args) {
  let circuitId = null;
  let apply = false;
  let all = false;

  for (const argument of args) {
    if (argument === '--apply') {
      if (apply) throw new Error('Параметр --apply указан повторно');
      apply = true;
    } else if (argument === '--all') {
      if (all) throw new Error('Параметр --all указан повторно');
      all = true;
    } else if (argument.startsWith('--circuit=')) {
      if (circuitId !== null) throw new Error('Параметр --circuit указан повторно');
      circuitId = argument.slice('--circuit='.length);
      if (!circuitIdPattern.test(circuitId)) throw new Error('Некорректный ID трассы');
    } else {
      throw new Error(`Неизвестный параметр: ${argument}`);
    }
  }

  if (all && circuitId !== null) throw new Error('Выберите --all или --circuit=ID');
  if (apply && !all && circuitId === null) throw new Error('Для записи укажите --all или --circuit=ID');
  return { circuitId, apply };
}

export function publicationSummary(row) {
  const counts = {
    poi: Number(row.poi),
    zones: Number(row.zones),
    routes: Number(row.routes),
  };
  const skippedNonpublished = {
    poi: Number(row.skipped_poi),
    zones: Number(row.skipped_zones),
    routes: Number(row.skipped_routes),
  };
  return { counts, skippedNonpublished };
}
