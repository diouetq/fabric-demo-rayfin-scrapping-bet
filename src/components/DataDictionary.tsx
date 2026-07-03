import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, X } from 'lucide-react';

interface DictionaryEntry {
  db: string;
  form: string;
  scraper: string;
  description: string;
}

/**
 * Correspondance entre 3 vocabulaires du pipeline :
 *  - BDD    : colonne SQL réelle de dbo.fait_paris (source de vérité, cf. rayfin/data/FaitPari.ts)
 *  - Form   : champ ParisFormValues / ParisRecord (src/lib/paris-form.ts, src/services/paris-service.ts)
 *  - Cotes collectées : champ brut issu de la récupération de cotes (ScrapedOdd/ComputedBettingRow, src/lib/betting-calculations.ts)
 * En cas de désaccord de libellé entre les 3, c'est le nom BDD qui prime pour l'affichage.
 */
const ENTRIES: DictionaryEntry[] = [
  { db: 'id_pari (PK)', form: 'id', scraper: '—', description: 'Identifiant unique, généré par la base (BIGINT IDENTITY).' },
  { db: 'source_insertion', form: 'sourceInsertion', scraper: '—', description: "Origine de la ligne : 'Manuel', 'Scrap' ou 'Import'." },
  { db: 'date_pari', form: 'datePari', scraper: 'extraction', description: 'Date du pari.' },
  { db: 'id_bookmaker', form: 'idBookmaker', scraper: 'bookmaker (nom → résolu en id)', description: 'Bookmaker (référentiel dim_bookmaker).' },
  { db: 'id_sport', form: 'idSport', scraper: 'apiId (résolu via dim_sport_ids_api)', description: 'Sport (référentiel dim_sport).' },
  { db: 'libelle_competition', form: 'libelleCompetition', scraper: 'competition', description: 'Compétition / tournoi.' },
  { db: 'libelle_evenement', form: 'libelleEvenement', scraper: 'evenement + competiteur', description: 'Événement et sélection pariée.' },
  { db: 'id_type_pari', form: 'idTypePari', scraper: '— (suggéré depuis boostPct)', description: 'Type de pari (référentiel dim_type_pari).' },
  { db: 'cote_bookmaker', form: 'coteBookmaker', scraper: 'cote', description: 'Cote proposée par le bookmaker.' },
  { db: 'mise_engagee', form: 'miseEngagee', scraper: 'stake (calculé Kelly)', description: 'Mise engagée, en euros.' },
  { db: 'id_resultat', form: 'idResultat', scraper: '—', description: 'Résultat : gagné / perdu / remboursé / en cours.' },
  { db: 'cote_marche_reference', form: 'coteMarcheReference', scraper: 'coteMarcheReference (saisie manuelle, ex. PS3838)', description: 'Cote de référence marché (sert au calcul MPTO).' },
  { db: 'cote_vraie_mpto', form: 'coteVraieMpto', scraper: 'trueOddsMpto', description: 'Cote vraie recalculée (moyenne pondérée two-outcome).' },
  { db: 'probabilite_implicite', form: '— (non exposé au formulaire)', scraper: 'impliedProb', description: 'Probabilité implicite = 1 / cote de référence.' },
  { db: 'probabilite_reelle_mpto', form: '— (non exposé au formulaire)', scraper: 'trueProbMpto', description: 'Probabilité réelle recalculée (MPTO).' },
  { db: 'trj_bookmaker', form: 'trjBookmaker', scraper: 'trjBook', description: 'TRJ croisé sur les deux cotes bookmaker de la paire.' },
  { db: 'trj_ps3838', form: 'trjPs3838', scraper: 'trjPs3838', description: 'TRJ croisé sur les deux cotes de référence (PS3838).' },
  { db: 'trj_marche', form: 'trjMarche', scraper: 'trj', description: 'TRJ croisé cote bookmaker / cote de référence.' },
  { db: 'pourcentage_boost', form: 'pourcentageBoost', scraper: 'boostPct', description: 'Écart relatif entre cote bookmaker et cote vraie.' },
  { db: 'critere_kelly', form: 'critereKelly', scraper: 'kelly', description: 'Fraction de Kelly calculée pour la mise.' },
  { db: 'flag_surebet', form: 'flagSurebet', scraper: 'surebet', description: "Surebet détecté sur la paire ('YES'/'NO')." },
  { db: 'date_heure_maj_scrap', form: 'dateHeureMajScrap', scraper: 'extraction', description: 'Horodatage de la dernière mise à jour scrap.' },
  { db: 'date_heure_modification', form: '— (géré par la BDD)', scraper: '—', description: 'Horodatage de dernière modification, mis à jour côté base.' },
  { db: '— (non persisté)', form: '—', scraper: 'PairKey / pair_key', description: "Clé technique d'appariement des 2 issues d'un même marché (cf. _MarketKey côté Excel) — sert au calcul du TRJ, jamais enregistrée en base." },
  { db: '— (non persisté)', form: '—', scraper: 'marche', description: "Nom du marché (ex. Total, Handicap, Vainqueur) — sert à regrouper les 2 issues, absorbé dans libelle_evenement à l'enregistrement." },
];

function DataDictionaryContent() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Correspondance entre les 3 vocabulaires du pipeline : colonne <strong>BDD</strong> (dbo.fait_paris),
        champ <strong>Formulaire</strong> (saisie / édition) et champ <strong>Cotes collectées</strong> (donnée brute avant enregistrement).
        En cas de désaccord entre les libellés affichés, c'est le nom de colonne BDD qui prime.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-primary text-primary-foreground">
            <tr>
              <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Colonne BDD</th>
              <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Formulaire</th>
              <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Cotes collectées</th>
              <th className="px-2 py-1.5 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody>
            {ENTRIES.map((e, i) => (
              <tr key={e.db + e.scraper} className={i % 2 === 1 ? 'bg-muted/20' : ''}>
                <td className="px-2 py-1.5 align-top font-mono text-[10px] font-semibold text-foreground whitespace-nowrap">{e.db}</td>
                <td className="px-2 py-1.5 align-top font-mono text-[10px] text-foreground whitespace-nowrap">{e.form}</td>
                <td className="px-2 py-1.5 align-top font-mono text-[10px] text-foreground whitespace-nowrap">{e.scraper}</td>
                <td className="px-2 py-1.5 align-top text-muted-foreground">{e.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Icône discrète dans l'entête — ouvre le dictionnaire des données en modal, à consulter au besoin. */
export function DataDictionaryButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Dictionnaire des données (BDD / formulaire / cotes collectées)"
        className="inline-flex items-center justify-center rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <BookOpen className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <BookOpen className="h-4 w-4 text-primary" />
                Dictionnaire des données
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DataDictionaryContent />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
