import { toDateOnly, withDateOnly } from './date-only';

describe('toDateOnly', () => {
  it('rend une date sans heure à partir de l’objet Date de node-postgres', () => {
    // node-postgres construit minuit dans le fuseau du processus.
    expect(toDateOnly(new Date(2030, 0, 14, 0, 0, 0))).toBe('2030-01-14');
  });

  it('ne recule pas d’un jour à l’est de Greenwich (piège de toISOString)', () => {
    const minuitLocal = new Date(2030, 0, 14, 0, 0, 0);
    // Sous un fuseau en avance, l'ISO UTC désigne la veille : c'est exactement ce qu'il ne faut
    // pas renvoyer. Le test n'a de sens que si le fuseau du processus est effectivement en avance.
    if (minuitLocal.getTimezoneOffset() < 0) {
      expect(minuitLocal.toISOString().slice(0, 10)).toBe('2030-01-13');
    }
    expect(toDateOnly(minuitLocal)).toBe('2030-01-14');
  });

  it('tronque une chaîne déjà datée et laisse passer null', () => {
    expect(toDateOnly('2030-01-14')).toBe('2030-01-14');
    expect(toDateOnly('2030-01-14T00:00:00.000Z')).toBe('2030-01-14');
    expect(toDateOnly(null)).toBeNull();
  });

  it('withDateOnly ne touche que les clés demandées', () => {
    const row = { id: 'x', scheduled_date: new Date(2030, 0, 14), created_at: new Date(2030, 0, 14, 8, 30) };
    const out = withDateOnly(row, 'scheduled_date');
    expect(out.scheduled_date).toBe('2030-01-14');
    expect(out.created_at).toBeInstanceOf(Date);
    expect(out.id).toBe('x');
  });
});
