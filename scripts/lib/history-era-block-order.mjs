const SMALLINT_MAX = 32767;

function validateOrderedIds(value, label) {
  if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error(label);
  }
  return value;
}

export function planHistoryEraBlockOrder(existingRows, rawInput) {
  const orderedIds = validateOrderedIds(rawInput?.orderedIds, 'Некорректный порядок блоков эпохи');
  const expectedOrderedIds = validateOrderedIds(
    rawInput?.expectedOrderedIds,
    'Некорректный исходный порядок блоков эпохи',
  );

  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('Порядок содержит повторяющиеся блоки');
  }
  if (new Set(expectedOrderedIds).size !== expectedOrderedIds.length) {
    throw new Error('Исходный порядок содержит повторяющиеся блоки');
  }

  const existingIds = existingRows.map((row) => Number(row.id));
  const requestedIds = new Set(orderedIds);
  if (existingIds.length !== orderedIds.length || existingIds.some((id) => !requestedIds.has(id))) {
    throw new Error('Набор блоков изменился. Обновите страницу и повторите');
  }
  if (existingIds.length !== expectedOrderedIds.length
    || existingIds.some((id, index) => id !== expectedOrderedIds[index])) {
    throw new Error('Порядок блоков уже изменился. Обновите страницу и повторите');
  }

  if (orderedIds.length === 0) {
    return { orderedIds, temporaryBase: null, temporaryAssignments: [], finalAssignments: [] };
  }

  const maximum = Math.max(...existingRows.map((row) => Number(row.sort_order)));
  const temporaryBase = maximum + 1;
  if (temporaryBase + orderedIds.length - 1 > SMALLINT_MAX) {
    throw new Error('Не удалось выделить временный диапазон сортировки');
  }

  return {
    orderedIds,
    temporaryBase,
    temporaryAssignments: orderedIds.map((id, index) => ({ id, sortOrder: temporaryBase + index })),
    finalAssignments: orderedIds.map((id, index) => ({ id, sortOrder: index })),
  };
}
