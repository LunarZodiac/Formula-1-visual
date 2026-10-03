import generatedHistory from './history-eras.generated.json';

export type HistoryEraBlock = {
  id: string;
  sortOrder: number;
  type: 'text' | 'media' | 'quote' | 'timeline' | 'entities';
  eyebrowRu?: string;
  titleRu?: string;
  bodyRu?: string;
  media?: { url: string; altTextRu: string };
  mediaPosition?: 'left' | 'right' | 'wide';
};

export type HistoryEra = {
  slug: string;
  years: string;
  startYear: number;
  endYear: number;
  title: string;
  description: string;
  chapters: readonly string[];
  blocks: readonly HistoryEraBlock[];
};

const fallbackEras: readonly HistoryEra[] = [
  { slug: '1950-1959', years: '1950 – 1959', startYear: 1950, endYear: 1959, title: 'Рождение чемпионата', description: 'Первые календари, команды, пилоты и безопасность трасс', chapters: ['Как возник чемпионат', 'География первого календаря', 'Команды и пилоты эпохи', 'Трассы и безопасность'], blocks: [] },
  { slug: '1960-1979', years: '1960 – 1979', startYear: 1960, endYear: 1979, title: 'Расширение географии', description: 'Новые места проведения Гран-при, технические перемены и преобразование автодромов', chapters: ['Новые центры чемпионата', 'Технические перемены', 'Команды и пилоты эпохи', 'Преобразование автодромов'], blocks: [] },
  { slug: '1980-1999', years: '1980 – 1999', startYear: 1980, endYear: 1999, title: 'Глобальная серия', description: 'Мировой календарь, соперничества команд и требования к трассам', chapters: ['Мировой календарь', 'Команды как инженерные системы', 'Главные соперничества', 'Новые требования к трассам'], blocks: [] },
  { slug: '2000-2013', years: '2000 – 2013', startYear: 2000, endYear: 2013, title: 'Эпоха систем', description: 'Регламент, технологии, безопасность и инфраструктура автодромов', chapters: ['Расширение календаря', 'Регламент и технологии', 'Команды и пилоты эпохи', 'Безопасность и инфраструктура'], blocks: [] },
  { slug: '2014-2021', years: '2014 – 2021', startYear: 2014, endYear: 2021, title: 'Гибридный поворот', description: 'Гибридные силовые установки, календарь и команды 2014–2021 годов', chapters: ['Новый технический цикл', 'География календаря', 'Команды и пилоты эпохи', 'Цифровая Formula 1'], blocks: [] },
  { slug: '2022-present', years: '2022 – наши дни', startYear: 2022, endYear: 2026, title: 'Современная эра', description: 'Регламент, география календаря и команды последних сезонов', chapters: ['Новый регламент', 'Современная география', 'Команды и пилоты эпохи', 'Направления развития'], blocks: [] },
] as const;

const publishedBySlug = new Map((generatedHistory.eras as Array<{
  slug: string; startYear: number; endYear: number | null; yearsLabel: string; titleRu: string;
  summaryRu: string; blocks: HistoryEraBlock[];
}>).map((era) => [era.slug, era]));

export const historyEras: readonly HistoryEra[] = fallbackEras.map((fallback) => {
  const published = publishedBySlug.get(fallback.slug);
  if (!published) return fallback;
  return {
    ...fallback,
    years: published.yearsLabel,
    startYear: published.startYear,
    endYear: published.endYear ?? new Date().getUTCFullYear(),
    title: published.titleRu,
    description: published.summaryRu,
    blocks: published.blocks,
  };
});

export function getHistoryEra(slug: string) {
  return historyEras.find((era) => era.slug === slug);
}
