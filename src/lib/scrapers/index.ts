import type { BookmakerId, ScraperResult, ScrapedOdd } from './types';
import { scrapeSportaza } from './sportaza';
import { scrapeGreenluck } from './greenluck';
import { scrapeBetify } from './betify';
import { scrapeMystake } from './mystake';
import { scrapeSlott } from './slott';
import type { SportIdConfig } from './config';

type ScraperFn = (sportIds: string[]) => Promise<ScrapedOdd[]>;

const SCRAPERS: Record<BookmakerId, ScraperFn> = {
  sportaza: scrapeSportaza,
  greenluck: scrapeGreenluck,
  betify: scrapeBetify,
  mystake: scrapeMystake,
  slott: scrapeSlott,
};

export async function scrapeBookmaker(
  id: BookmakerId,
  sportIds: string[],
): Promise<ScraperResult> {
  try {
    const rows = await SCRAPERS[id](sportIds);
    return { bookmaker: id, rows };
  } catch (err) {
    return {
      bookmaker: id,
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function scrapeAllBookmakers(
  config: SportIdConfig,
  selected: BookmakerId[],
): Promise<ScraperResult[]> {
  return Promise.all(selected.map((id) => scrapeBookmaker(id, config[id])));
}

export type { ScrapedOdd, BookmakerId, ScraperResult } from './types';
export {
  BOOKMAKERS, DEFAULT_SPORT_IDS, loadSportIdConfig, saveSportIdConfig,
  parseSportIdInput, formatSportIdInput, VISIBLE_BOOKMAKER_IDS, CYCLING_SPORT_IDS,
  type SportIdConfig,
} from './config';
