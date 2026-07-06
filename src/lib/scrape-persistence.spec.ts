import { describe, expect, it } from 'vitest';

import {
  preservePs3838OverridesForActiveRows,
  rowOddsKey,
  mergeScrapeRows,
} from './scrape-persistence';

describe('scrape-persistence utilities', () => {
  it('utilise pairKey quand il est disponible pour identifier une ligne', () => {
    const rowWithPairKey = {
      bookmaker: 'Betify',
      competition: 'Tour de France',
      evenement: 'Stage 2',
      competiteur: 'Van Gils, Maxim',
      pairKey: '123|456|789',
    };
    const rowWithoutPairKey = {
      bookmaker: 'Betify',
      competition: 'Tour de France',
      evenement: 'Stage 2',
      competiteur: 'Van Gils, Maxim',
    };

    expect(rowOddsKey(rowWithPairKey)).toBe('Betify::pairKey::123|456|789::Van Gils, Maxim');
    expect(rowOddsKey(rowWithoutPairKey)).toBe(
      'Betify::Tour de France::Stage 2::Van Gils, Maxim',
    );
  });

  it('ne duplique pas une ligne Betify existante si le pairKey reste identique après refresh', () => {
    const existing: any = [
      {
        bookmaker: 'Betify',
        competition: 'Tour de France',
        evenement: 'Stage 2',
        competiteur: 'Van Gils, Maxim',
        pairKey: '123|456|789',
        cote: 2.55,
        extraction: new Date(),
        cutoff: new Date(Date.now() + 3600000),
        coteMarcheReference: null,
      },
    ];
    const incoming: any = [
      {
        bookmaker: 'Betify',
        competition: 'Tour de France',
        evenement: 'Stage 2',
        competiteur: 'Van Gils, Maxim',
        pairKey: '123|456|789',
        cote: 2.55,
        extraction: new Date(),
        cutoff: new Date(Date.now() + 3600000),
        coteMarcheReference: null,
      },
    ];

    expect(mergeScrapeRows(existing, incoming, ['Betify'])).toEqual(incoming);
  });

  it('conserve les overrides pour les lignes encore présentes après un refresh', () => {
    const overrides = {
      'Betify::Comp1::Even1::Runner1': 2.3,
      'Betify::Comp1::Even2::Runner2': 4.5,
      'Sportaza::Comp2::Even3::Runner3': 1.9,
    };

    const activeRows = [
      { bookmaker: 'Betify', competition: 'Comp1', evenement: 'Even1', competiteur: 'Runner1' },
    ];

    const next = preservePs3838OverridesForActiveRows(overrides, activeRows, ['Betify']);

    expect(next).toEqual({
      'Betify::Comp1::Even1::Runner1': 2.3,
      'Sportaza::Comp2::Even3::Runner3': 1.9,
    });
  });
});
