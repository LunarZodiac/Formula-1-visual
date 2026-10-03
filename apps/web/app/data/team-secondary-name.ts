type SeasonalTeamIdentity = {
  id: string;
  name: string;
};

type TeamSecondaryNameSource = {
  id: string;
  nameRu?: string;
  firstSeason: number;
  latestSeason: number;
  seasons: { season: number; name: string }[];
};

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

export function distinctTeamSecondaryName(officialName: string, nameRu: string | undefined): string | undefined {
  const secondaryName = nameRu?.trim().replace(/\s+/g, ' ');
  if (!secondaryName || normalizedName(secondaryName) === normalizedName(officialName)) return undefined;
  return secondaryName;
}

export function resolveTeamSecondaryName(
  team: SeasonalTeamIdentity,
  season: number,
  sources: readonly TeamSecondaryNameSource[],
): string | undefined {
  const matches = sources.filter((source) => source.id === team.id);
  if (matches.length !== 1) return undefined;

  const source = matches[0];
  if (season < source.firstSeason || season > source.latestSeason) return undefined;
  const seasonalIdentity = source.seasons.find((entry) => entry.season === season);
  if (!seasonalIdentity || normalizedName(seasonalIdentity.name) !== normalizedName(team.name)) return undefined;

  return distinctTeamSecondaryName(team.name, source.nameRu);
}
