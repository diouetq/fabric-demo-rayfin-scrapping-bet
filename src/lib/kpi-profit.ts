import type { ParisDisplayRow } from '@/services/paris-service';

/** dim_type_pari id for « Mise Freebet » */
export const FREEBET_TYPE_ID = 4;

export function isFreebet(r: Pick<ParisDisplayRow, 'idTypePari'>): boolean {
  return r.idTypePari === FREEBET_TYPE_ID;
}

/** Mise comptée pour ROI / mise totale (freebet = 0€ réel). */
export function effectiveStake(r: Pick<ParisDisplayRow, 'idTypePari' | 'miseEngagee'>): number {
  return isFreebet(r) ? 0 : r.miseEngagee;
}

/**
 * Profit net réel d'un pari terminé.
 * - Paris classique gagné : gain_net (payout brut) − mise
 * - Freebet gagné : gain_net = (cote−1)×mise déjà (cf. computeGainNet)
 * - Freebet perdu : 0 (pas d'argent réel engagé)
 */
export function rowProfitNet(r: ParisDisplayRow): number {
  if (r.idResultat === 1) {
    if (r.gainNet == null) return 0;
    return isFreebet(r) ? r.gainNet : r.gainNet - r.miseEngagee;
  }
  if (r.idResultat === 2) {
    return isFreebet(r) ? 0 : -r.miseEngagee;
  }
  return 0;
}
