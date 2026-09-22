const allowedDecisions = new Set(['accept', 'defer']);

export function validateSpaCulturalReview(review) {
  if (!review || review.circuitId !== 'spa' || review.publicationStatus !== 'review_only'
    || !/^\d{4}-\d{2}-\d{2}$/.test(review.checkedAt ?? '') || !Array.isArray(review.records)) {
    throw new Error('Некорректный формат редакционной проверки культурных точек Спа');
  }

  const candidateIds = new Set();
  for (const record of review.records) {
    if (!record?.candidateId || candidateIds.has(record.candidateId)
      || !allowedDecisions.has(record.decision)
      || !record.nameRu?.trim() || !record.nameOriginal?.trim()
      || !record.descriptionRu?.trim() || !record.riskNotes?.trim()
      || !/^https:\/\//.test(record.sourceUrl ?? '')
      || !/^\d{4}-\d{2}-\d{2}$/.test(record.sourceDate ?? '')) {
      throw new Error(`Некорректная или повторяющаяся запись: ${record?.candidateId ?? '—'}`);
    }
    candidateIds.add(record.candidateId);
  }

  return review;
}

export function acceptedSpaCulturalRecords(review) {
  return validateSpaCulturalReview(review).records.filter((record) => record.decision === 'accept');
}
