/**
 * Picks the plural form of a count for the language. Arabic has six forms (zero, one, two, 3 to 10,
 * 11 to 99, 100 and over) and a fixed "{n} noun" is wrong for most of them.
 */
export function pluralForm(
  locale: string,
  n: number,
): "zero" | "one" | "two" | "few" | "many" | "other" {
  return new Intl.PluralRules(locale).select(n);
}
