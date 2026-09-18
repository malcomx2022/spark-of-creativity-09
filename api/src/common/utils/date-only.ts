/**
 * Sérialisation des colonnes `date` (sans heure) pour le front.
 *
 * node-postgres rend une colonne `date` en objet Date, construit à minuit dans le fuseau du
 * processus ; `database/types.ts` la déclare fidèlement `ColumnType<Date | string, ...>`. Une
 * fois passée par JSON.stringify, elle devient une chaîne ISO complète — « 2030-01-14 » arrive
 * au navigateur en « 2030-01-14T00:00:00.000Z ». PostgREST, que Supabase plaçait devant la base,
 * rendait « 2030-01-14 », et le front a été écrit contre ce contrat : il concatène la date avec
 * l'heure (`new Date(scheduled_date + 'T' + start_time)`, d'où une date invalide) et alimente des
 * `<input type="date">`, qui n'acceptent que `yyyy-MM-dd` et restent vides sinon.
 *
 * La conversion est faite ici, à la frontière, comme le projet le fait déjà pour les `numeric`
 * (`withRating`, `round`) et les `bigint` (`Number(count.n)`), plutôt que par un parseur pg global
 * qui rendrait mensongers les types générés.
 *
 * Les composantes lues sont **locales** et non UTC : l'objet Date pointe minuit dans le fuseau du
 * serveur, si bien que `toISOString()` reculerait d'un jour à l'est de Greenwich — le fuseau du
 * Bénin, entre autres.
 */
export function toDateOnly(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Applique `toDateOnly` aux clés indiquées d'une ligne, en préservant le reste. */
export function withDateOnly<T extends object, K extends keyof T>(row: T, ...keys: K[]): T {
  const out = { ...row };
  for (const k of keys) {
    const v = out[k] as unknown as Date | string | null;
    if (v !== undefined) out[k] = toDateOnly(v) as unknown as T[K];
  }
  return out;
}
