import { describe, expect, it } from 'vitest';
import { computeBettingRows, type BettingRowInput } from './betting-calculations';

function makePair(event: string, coteA: number, coteB: number, psA?: number, psB?: number): BettingRowInput[] {
  const base = {
    bookmaker: 'Sportaza',
    competition: 'Test League',
    extraction: new Date('2026-01-01T12:00:00'),
    cutoff: new Date('2026-01-02T20:00:00'),
    evenement: event,
  };
  return [
    { ...base, competiteur: 'Team A', cote: coteA, coteMarcheReference: psA ?? null },
    { ...base, competiteur: 'Team B', cote: coteB, coteMarcheReference: psB ?? null },
  ];
}

describe('computeBettingRows', () => {
  it('computes TRJ cross-odds between paired rows', () => {
    const rows = makePair('Match 1', 2.0, 2.1, 1.95, 2.05);
    const result = computeBettingRows(rows, { kellyFraction: 4, stakeValue: 20 });

    expect(result).toHaveLength(2);
    const trjA = 1 / (1 / 2.0 + 1 / 2.05);
    expect(result[0].trj).toBeCloseTo(trjA, 5);
    expect(result[1].trj).toBeCloseTo(1 / (1 / 2.1 + 1 / 1.95), 5);
  });

  it('flags surebet when TRJ > 1', () => {
    const rows = makePair('Match 2', 2.2, 2.2, 2.0, 2.0);
    const result = computeBettingRows(rows, { kellyFraction: 4, stakeValue: 20 });
    expect(result[0].surebet).toBe('YES');
    expect(result[1].surebet).toBe('YES');
  });

  it('computes boost when PS3838 odds are set', () => {
    const rows = makePair('Match 3', 2.5, 1.6, 2.0, null);
    const result = computeBettingRows(rows, { kellyFraction: 4, stakeValue: 20 });
    expect(result[0].trueOddsMpto).not.toBeNull();
    expect(result[0].boostPct).not.toBeNull();
  });

  it('computes TRJ book from bookmaker odds only', () => {
    const rows = makePair('Match 4', 1.9, 2.0);
    const result = computeBettingRows(rows, { kellyFraction: 4, stakeValue: 20 });
    const expected = 1 / (1 / 1.9 + 1 / 2.0);
    expect(result[0].trjBook).toBeCloseTo(expected, 5);
    expect(result[1].trjBook).toBeCloseTo(expected, 5);
  });
});
