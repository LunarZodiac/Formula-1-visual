export function parseTravelExportArgs(args) {
  let circuitId = null;
  let checkOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') {
      if (checkOnly) throw new Error('Параметр --check указан повторно');
      checkOnly = true;
      continue;
    }
    if (argument === '--circuit' || argument.startsWith('--circuit=')) {
      if (circuitId !== null) throw new Error('Укажите только одну трассу');
      const value = argument === '--circuit' ? args[++index] : argument.slice('--circuit='.length);
      if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Некорректный ID трассы');
      circuitId = value;
      continue;
    }
    throw new Error(`Неизвестный параметр экспорта: ${argument}`);
  }
  return { circuitId, checkOnly };
}
