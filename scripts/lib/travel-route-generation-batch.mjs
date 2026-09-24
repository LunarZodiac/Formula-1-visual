export async function applyGeneratedRouteBatch({ client, circuitId, suggestions, checkSources, loadFingerprints, save }) {
  if (!suggestions.length) throw new Error('Выберите хотя бы один маршрут для сохранения');
  let created = 0;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`route-generation:${circuitId}`]);
    await checkSources(client);
    const existing = await loadFingerprints(client);
    for (const suggestion of suggestions) {
      if (existing.has(suggestion.semanticFingerprint)) continue;
      const saved = await save(client, suggestion, created);
      if (saved?.created) {
        created += 1;
        existing.add(suggestion.semanticFingerprint);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
  return { created, skipped: suggestions.length - created };
}
