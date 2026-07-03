import { FaitPari } from './FaitPari.js';
import { DimBookmaker } from './DimBookmaker.js';
import { DimSport } from './DimSport.js';
import { DimTypePari } from './DimTypePari.js';
import { DimResultat } from './DimResultat.js';
import { DimSportIdsAPI } from './DimSportIdsAPI.js';

export type AppSchema = {
  FaitPari: FaitPari;
  DimBookmaker: DimBookmaker;
  DimSport: DimSport;
  DimTypePari: DimTypePari;
  DimResultat: DimResultat;
  DimSportIdsAPI: DimSportIdsAPI;
};

export const schema = [FaitPari, DimBookmaker, DimSport, DimTypePari, DimResultat, DimSportIdsAPI];
