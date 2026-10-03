const countPluralRules = new Intl.PluralRules('ru');

/** Forms are singular, few and many: победа / победы / побед. */
export function russianCountNoun(value: number, forms: readonly [string, string, string]): string {
  const category = countPluralRules.select(value);
  if (category === 'one') return forms[0];
  if (category === 'few' || category === 'other') return forms[1];
  return forms[2];
}
