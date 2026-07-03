import type { ComputedBettingRow } from '@/lib/betting-calculations';
import {
  buildLibelleEvenement,
  findSportIdByApiId,
  getDimensions,
  getResultatEnCoursId,
  resolveBookmakerIdFromLabel,
  suggestTypePariId,
  truncateCompetition,
} from '@/lib/dimensions';
import type { ParisRecord, ParisSourceInsertion } from '@/services/paris-service';

export interface ParisFormValues {
  sourceInsertion: ParisSourceInsertion;
  datePari: string;
  idBookmaker: number | '';
  idSport: number | '';
  libelleCompetition: string;
  libelleEvenement: string;
  idTypePari: number | '';
  coteBookmaker: number | '';
  miseEngagee: number | '';
  idResultat: number | '';
  coteMarcheReference: number | '';
  coteVraieMpto: number | '';
  trjBookmaker: number | '';
  trjPs3838: number | '';
  trjMarche: number | '';
  pourcentageBoost: number | '';
  critereKelly: number | '';
  flagSurebet: boolean | '';
}

export function emptyParisFormValues(source: ParisSourceInsertion = 'Manuel'): ParisFormValues {
  return {
    sourceInsertion: source,
    datePari: new Date().toISOString().slice(0, 10),
    idBookmaker: '',
    idSport: '',
    libelleCompetition: '',
    libelleEvenement: '',
    idTypePari: '',
    coteBookmaker: '',
    miseEngagee: '',
    idResultat: getResultatEnCoursId(),
    coteMarcheReference: '',
    coteVraieMpto: '',
    trjBookmaker: '',
    trjPs3838: '',
    trjMarche: '',
    pourcentageBoost: '',
    critereKelly: '',
    flagSurebet: '',
  };
}

export function parisRecordToFormValues(record: ParisRecord): ParisFormValues {
  return {
    sourceInsertion: record.sourceInsertion,
    datePari: record.datePari.toISOString().slice(0, 10),
    idBookmaker: record.idBookmaker,
    idSport: record.idSport,
    libelleCompetition: record.libelleCompetition ?? '',
    libelleEvenement: record.libelleEvenement,
    idTypePari: record.idTypePari,
    coteBookmaker: record.coteBookmaker,
    miseEngagee: record.miseEngagee,
    idResultat: record.idResultat ?? getResultatEnCoursId(),
    coteMarcheReference: record.coteMarcheReference ?? '',
    coteVraieMpto: record.coteVraieMpto ?? '',
    trjBookmaker: record.trjBookmaker ?? '',
    trjPs3838: record.trjPs3838 ?? '',
    trjMarche: record.trjMarche ?? '',
    pourcentageBoost: record.pourcentageBoost ?? '',
    critereKelly: record.critereKelly ?? '',
    flagSurebet: record.flagSurebet ?? '',
  };
}

/** Pré-remplit depuis une ligne scrap — champs manquants laissés vides pour saisie manuelle. */
export function scrapRowToFormValues(row: ComputedBettingRow): ParisFormValues {
  const idBookmaker = resolveBookmakerIdFromLabel(row.bookmaker) ?? '';
  const datePari = (row.extraction ?? new Date()).toISOString().slice(0, 10);

  const idSport: number | '' = (() => {
    try {
      const dims = getDimensions();
      return findSportIdByApiId(dims.sportIdsApi, row.bookmaker, row.apiId) ?? '';
    } catch {
      return '';
    }
  })();

  return {
    sourceInsertion: 'Scrap',
    datePari,
    idBookmaker,
    idSport,
    libelleCompetition: truncateCompetition(row.competition),
    libelleEvenement: buildLibelleEvenement(row.evenement, row.competiteur),
    idTypePari: suggestTypePariId(row.boostPct),
    coteBookmaker: row.cote,
    miseEngagee: row.stake ?? '',
    idResultat: getResultatEnCoursId(),
    coteMarcheReference: row.coteMarcheReference ?? '',
    coteVraieMpto: row.trueOddsMpto ?? '',
    trjBookmaker: row.trjBook ?? '',
    trjPs3838: row.trjPs3838 ?? '',
    trjMarche: row.trj ?? '',
    pourcentageBoost: row.boostPct ?? '',
    critereKelly: row.kelly ?? '',
    flagSurebet: row.surebet === 'YES' ? true : row.surebet === 'NO' ? false : '',
  };
}

export function formValuesToParisInput(values: ParisFormValues): Omit<ParisRecord, 'id'> {
  if (
    values.idBookmaker === '' ||
    values.idSport === '' ||
    values.idTypePari === '' ||
    values.coteBookmaker === '' ||
    values.miseEngagee === ''
  ) {
    throw new Error('Bookmaker, sport, type de pari, cote et mise sont obligatoires.');
  }

  return {
    sourceInsertion: values.sourceInsertion,
    datePari: new Date(values.datePari + 'T12:00:00'),
    idBookmaker: values.idBookmaker,
    idSport: values.idSport,
    libelleCompetition: values.libelleCompetition.trim() || undefined,
    libelleEvenement: values.libelleEvenement.trim(),
    idTypePari: values.idTypePari,
    coteBookmaker: Number(values.coteBookmaker),
    miseEngagee: Number(values.miseEngagee),
    idResultat: values.idResultat === '' ? getResultatEnCoursId() : values.idResultat,
    coteMarcheReference: values.coteMarcheReference === '' ? undefined : Number(values.coteMarcheReference),
    coteVraieMpto: values.coteVraieMpto === '' ? undefined : Number(values.coteVraieMpto),
    trjBookmaker: values.trjBookmaker === '' ? undefined : Number(values.trjBookmaker),
    trjPs3838: values.trjPs3838 === '' ? undefined : Number(values.trjPs3838),
    trjMarche: values.trjMarche === '' ? undefined : Number(values.trjMarche),
    pourcentageBoost: values.pourcentageBoost === '' ? undefined : Number(values.pourcentageBoost),
    critereKelly: values.critereKelly === '' ? undefined : Number(values.critereKelly),
    flagSurebet: values.flagSurebet === '' ? undefined : values.flagSurebet,
    dateHeureMajScrap: values.sourceInsertion === 'Scrap' ? new Date() : undefined,
  };
}

export function missingRequiredFields(values: ParisFormValues): string[] {
  const missing: string[] = [];
  if (values.idBookmaker === '') missing.push('Bookmaker');
  if (values.idSport === '') missing.push('Sport');
  if (values.idTypePari === '') missing.push('Type de pari');
  if (!values.libelleEvenement.trim()) missing.push('Événement');
  if (values.coteBookmaker === '' || Number(values.coteBookmaker) < 1) missing.push('Cote bookmaker');
  if (values.miseEngagee === '' || Number(values.miseEngagee) <= 0) missing.push('Mise');
  return missing;
}
