import {
  parseSeasonSnapshot,
  type SeasonSnapshot,
} from "../data/web-snapshots";

// Keep the season cache bounded: long historical careers should not retain the
// entire championship archive. Failed/aborted requests never enter the cache.
const cache = new Map<number, { time: number; snapshot: SeasonSnapshot }>();
const CACHE_LIMIT = 36;
const CACHE_TTL = 5 * 60 * 1000;

export async function loadAnalyticsSeasons(
  years: number[],
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void = () => {},
) {
  const queue = [...new Set(years)].sort((a, b) => a - b);
  const result: SeasonSnapshot[] = new Array(queue.length);
  let next = 0;
  let completed = 0;
  let failure: unknown;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const worker = async () => {
    while (next < queue.length) {
      controller.signal.throwIfAborted();
      const index = next++;
      const year = queue[index];
      const saved = cache.get(year);
      let snapshot =
        saved && Date.now() - saved.time < CACHE_TTL
          ? saved.snapshot
          : undefined;
      if (!snapshot) {
        const response = await fetch(`/data/f1/season-${year}.json`, {
          signal: controller.signal,
          cache: "no-cache",
        });
        if (!response.ok)
          throw new Error(
            `Не удалось загрузить сезон ${year} (HTTP ${response.status})`,
          );
        snapshot = parseSeasonSnapshot(await response.json(), year);
        controller.signal.throwIfAborted();
        cache.delete(year);
        cache.set(year, { time: Date.now(), snapshot });
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      }
      result[index] = snapshot;
      onProgress(++completed, queue.length);
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, async () => {
        try {
          await worker();
        } catch (error) {
          failure ??= error;
          controller.abort();
        }
      }),
    );
    if (failure) throw failure;
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
