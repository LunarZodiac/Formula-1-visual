import { randomUUID } from 'node:crypto';
import { env } from 'cloudflare:workers';

const workflowUrl = 'https://api.github.com/repos/LunarZodiac/Formula-1-visual/actions/workflows/season-sync.yml/dispatches';

function workflowToken() {
  const value = (env as unknown as Record<string, unknown>).GITHUB_SEASON_SYNC_TOKEN;
  return (typeof value === 'string' ? value : process.env.GITHUB_SEASON_SYNC_TOKEN)?.trim();
}

export function isSeasonSyncWorkflowConfigured() {
  return Boolean(workflowToken());
}

export async function queueSeasonSync(season: number) {
  if (!Number.isInteger(season) || season < 1950 || season > new Date().getUTCFullYear() + 1) {
    throw new Error('Некорректный год сезона');
  }
  const token = workflowToken();
  if (!token) throw new Error('Для обновления сезона не настроен GITHUB_SEASON_SYNC_TOKEN');

  const requestId = randomUUID();
  const response = await fetch(workflowUrl, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'f1-atlas-admin-season-sync',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main', inputs: { season: String(season), request_id: requestId } }),
  });

  if (response.status !== 204) {
    throw new Error(`GitHub не принял запуск импорта (HTTP ${response.status})`);
  }
  return { season, requestId };
}
