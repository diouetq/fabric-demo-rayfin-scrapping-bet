import { useMemo, useState, useEffect, type ReactNode } from 'react';
import type { ComputedBettingRow } from '@/lib/betting-calculations';
import {
  findBookmakerById,
  findSportById,
  findSportIdByApiId,
} from '@/lib/dimensions';
import { useDimensions } from '@/hooks/use-dimensions';
import {
  emptyParisFormValues,
  formValuesToParisInput,
  missingRequiredFields,
  parisRecordToFormValues,
  scrapRowToFormValues,
  type ParisFormValues,
} from '@/lib/paris-form';
import type { ParisDisplayRow, ParisSourceInsertion } from '@/services/paris-service';
import { createSport, upsertSportIdMapping, type DimSportType } from '@/services/dimensions-service';
import { isValidDecimalTyping, parseDecimalInput } from '@/lib/decimal-input';

const NEW_SPORT_VALUE = '__new_sport__';

interface ParisFormProps {
  mode: 'scrap' | 'manual';
  initialRecord?: ParisDisplayRow;
  scrapRow?: ComputedBettingRow;
  onSave: (input: ReturnType<typeof formValuesToParisInput>) => Promise<void>;
  onCancel: () => void;
}

function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase text-muted-foreground">
        {label}{required && ' *'}
      </span>
      {hint && <p className="text-[10px] text-muted-foreground mb-0.5">{hint}</p>}
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

const selectClass = 'w-full rounded border px-2 py-1.5 text-sm bg-background';
const inputClass = 'w-full rounded border px-2 py-1.5 text-sm bg-background';

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

function DecimalField({
  value,
  onChange,
  min,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  min?: number;
}) {
  const [text, setText] = useState(value !== '' ? String(value) : '');

  useEffect(() => {
    setText(value !== '' ? String(value) : '');
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      lang="fr"
      className={inputClass}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (!isValidDecimalTyping(raw)) return;
        setText(raw);
        const parsed = parseDecimalInput(raw);
        if (parsed == null) {
          onChange('');
          return;
        }
        if (min != null && parsed < min) return;
        onChange(parsed);
      }}
      onBlur={() => {
        const parsed = parseDecimalInput(text);
        if (parsed == null) {
          setText('');
          onChange('');
        } else {
          setText(String(parsed));
          onChange(parsed);
        }
      }}
    />
  );
}

export function ParisForm({ mode, initialRecord, scrapRow, onSave, onCancel }: ParisFormProps) {
  const { dims, loading: dimsLoading, error: dimsError, reload: reloadDims } = useDimensions();
  const [values, setValues] = useState<ParisFormValues>(() => {
    if (initialRecord) return parisRecordToFormValues(initialRecord);
    if (scrapRow) return scrapRowToFormValues(scrapRow);
    return emptyParisFormValues(mode === 'scrap' ? 'Scrap' : 'Manuel');
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberSportMapping, setRememberSportMapping] = useState(true);
  const [creatingSport, setCreatingSport] = useState(false);
  const [newSportName, setNewSportName] = useState('');
  const [newSportType, setNewSportType] = useState<DimSportType>('Sports de NICHE');
  const [creatingSportBusy, setCreatingSportBusy] = useState(false);
  const [creatingSportError, setCreatingSportError] = useState<string | null>(null);

  const missing = useMemo(() => missingRequiredFields(values), [values]);
  const selectedBm = values.idBookmaker !== '' ? findBookmakerById(values.idBookmaker) : undefined;
  const selectedSport = values.idSport !== '' ? findSportById(values.idSport) : undefined;

  // Le sport n'a pas pu être pré-rempli depuis le scrap : cet ID API n'est pas (encore)
  // référencé dans dim_sport_ids_API. On propose de mémoriser le choix manuel pour la prochaine fois.
  const scrapSportUnmapped =
    mode === 'scrap' &&
    !!scrapRow?.apiId &&
    dims != null &&
    findSportIdByApiId(dims.sportIdsApi, scrapRow.bookmaker, scrapRow.apiId) == null;

  const set = <K extends keyof ParisFormValues>(key: K, val: ParisFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  };

  const handleSubmit = async () => {
    if (missing.length) {
      setError(`Champs obligatoires : ${missing.join(', ')}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(formValuesToParisInput(values));
      if (scrapSportUnmapped && rememberSportMapping && values.idSport !== '' && scrapRow?.apiId) {
        upsertSportIdMapping({
          bookmaker: scrapRow.bookmaker,
          apiId: scrapRow.apiId,
          idSport: values.idSport,
        }).catch((e) => console.warn('[ParisForm] Mémorisation du mapping sport échouée :', e));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSport = async () => {
    const nom = newSportName.trim();
    if (!nom) {
      setCreatingSportError('Nom du sport requis.');
      return;
    }
    setCreatingSportBusy(true);
    setCreatingSportError(null);
    try {
      const { id } = await createSport({ nom, typeSport: newSportType });
      await reloadDims();
      set('idSport', id);
      setCreatingSport(false);
      setNewSportName('');
    } catch (e) {
      setCreatingSportError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingSportBusy(false);
    }
  };

  const scrapFields = mode === 'scrap' || values.sourceInsertion === 'Scrap';

  if (dimsLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Chargement des référentiels (bookmakers, sports…)…
      </div>
    );
  }

  if (dimsError || !dims) {
    return (
      <div className="rounded-xl border bg-destructive/10 p-4 space-y-2 text-sm">
        <p className="text-destructive font-medium">Référentiels indisponibles</p>
        <p className="text-muted-foreground">{dimsError ?? 'Aucune dimension chargée.'}</p>
        <button type="button" onClick={() => void reloadDims()}
          className="rounded border px-3 py-1 text-xs hover:bg-muted">
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            {initialRecord ? 'Modifier le pari' : mode === 'scrap' ? 'Enregistrer une cote collectée' : 'Nouveau pari manuel'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {mode === 'scrap'
              ? 'Les champs récupérés automatiquement sont pré-remplis — complétez sport et type de pari si besoin.'
              : 'Saisie complète — les métriques automatiques restent optionnelles.'}
          </p>
        </div>
        <select
          value={values.sourceInsertion}
          onChange={(e) => set('sourceInsertion', e.target.value as ParisSourceInsertion)}
          className="rounded border px-2 py-1 text-xs bg-background"
        >
          <option value="Manuel">Manuel</option>
          <option value="Scrap">Cotes collectées</option>
        </select>
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5">
          À compléter : {missing.join(' · ')}
        </p>
      )}

      {scrapSportUnmapped && (
        <div className="space-y-1.5 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-300">
          <p>
            Sport non reconnu pour l&apos;ID API <strong>{scrapRow?.apiId}</strong> chez{' '}
            <strong>{scrapRow?.bookmaker}</strong> — sélectionnez-le manuellement ci-dessous.
          </p>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={rememberSportMapping}
              onChange={(e) => setRememberSportMapping(e.target.checked)}
            />
            Mémoriser ce choix pour la prochaine fois (ID API {scrapRow?.apiId})
          </label>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date du pari" required>
          <input type="date" className={inputClass} value={values.datePari}
            onChange={(e) => set('datePari', e.target.value)} />
        </Field>

        <Field label="Bookmaker" required hint={selectedBm ? selectedBm.typeBookmaker : undefined}>
          <select className={selectClass} value={values.idBookmaker}
            onChange={(e) => set('idBookmaker', e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Choisir —</option>
            {dims.bookmakers.map((b) => (
              <option key={b.id} value={b.id}>{b.nom} ({b.typeBookmaker})</option>
            ))}
          </select>
        </Field>

        <Field label="Sport" required hint={selectedSport ? selectedSport.typeSport : undefined}>
          <select className={selectClass} value={values.idSport}
            onChange={(e) => {
              if (e.target.value === NEW_SPORT_VALUE) {
                setCreatingSport(true);
                return;
              }
              set('idSport', e.target.value ? Number(e.target.value) : '');
            }}>
            <option value="">— Choisir —</option>
            {dims.sports.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
            <option value={NEW_SPORT_VALUE}>+ Ajouter un nouveau sport…</option>
          </select>
          {creatingSport && (
            <div className="mt-1.5 space-y-1.5 rounded border border-dashed p-2">
              <input
                className={inputClass}
                placeholder="Nom du sport (ex. Badminton)"
                value={newSportName}
                onChange={(e) => setNewSportName(e.target.value)}
                maxLength={100}
              />
              <select
                className={selectClass}
                value={newSportType}
                onChange={(e) => setNewSportType(e.target.value as DimSportType)}
              >
                <option value="Sports de NICHE">Sports de NICHE</option>
                <option value="Sports MAJEURS">Sports MAJEURS</option>
              </select>
              {creatingSportError && <p className="text-[10px] text-destructive">{creatingSportError}</p>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleCreateSport()}
                  disabled={creatingSportBusy}
                  className="rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {creatingSportBusy ? 'Création…' : 'Créer et sélectionner'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingSport(false);
                    setNewSportName('');
                    setCreatingSportError(null);
                  }}
                  className="rounded border px-2 py-1 text-[11px]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </Field>

        <Field label="Type de pari" required>
          <select className={selectClass} value={values.idTypePari}
            onChange={(e) => set('idTypePari', e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Choisir —</option>
            {dims.typesPari.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </Field>

        <Field label="Compétition">
          <input className={inputClass} value={values.libelleCompetition}
            onChange={(e) => set('libelleCompetition', e.target.value)}
            placeholder="Ligue, tournoi…" maxLength={150} />
        </Field>

        <Field label="Événement" required>
          <input className={inputClass} value={values.libelleEvenement}
            onChange={(e) => set('libelleEvenement', e.target.value)}
            placeholder="Match · Sélection" maxLength={250} />
        </Field>

        <Field label="Résultat">
          <select className={selectClass} value={values.idResultat}
            onChange={(e) => set('idResultat', e.target.value ? Number(e.target.value) : '')}>
            {dims.resultats.map((r) => (
              <option key={r.id} value={r.id}>{r.libelle}</option>
            ))}
          </select>
        </Field>

        <Field label="Cote bookmaker" required>
          <DecimalField value={values.coteBookmaker} min={1}
            onChange={(v) => set('coteBookmaker', v)} />
        </Field>

        <Field label="Mise €" required>
          <DecimalField value={values.miseEngagee} min={0.01}
            onChange={(v) => set('miseEngagee', v)} />
        </Field>
      </div>

      {scrapFields && (
        <fieldset className="rounded-lg border border-dashed p-3 space-y-3">
          <legend className="text-xs font-semibold px-1">Données automatiques (optionnel — complétables plus tard)</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Côte marché réf.">
              <DecimalField value={values.coteMarcheReference} min={1}
                onChange={(v) => set('coteMarcheReference', v)} />
            </Field>
            <Field label="Côte vraie MPTO">
              <DecimalField value={values.coteVraieMpto}
                onChange={(v) => set('coteVraieMpto', v)} />
            </Field>
            <Field label="TRJ bookmaker">
              <DecimalField value={values.trjBookmaker}
                onChange={(v) => set('trjBookmaker', v)} />
            </Field>
            <Field label="TRJ marché">
              <DecimalField value={values.trjMarche}
                onChange={(v) => set('trjMarche', v)} />
            </Field>
            <Field label="Boost %">
              <DecimalField value={values.pourcentageBoost}
                onChange={(v) => set('pourcentageBoost', v)} />
            </Field>
            <Field label="Kelly">
              <DecimalField value={values.critereKelly}
                onChange={(v) => set('critereKelly', v)} />
            </Field>
            <Field label="Surebet">
              <select className={selectClass} value={values.flagSurebet === '' ? '' : values.flagSurebet ? '1' : '0'}
                onChange={(e) => set('flagSurebet', e.target.value === '' ? '' : e.target.value === '1')}>
                <option value="">—</option>
                <option value="1">Oui</option>
                <option value="0">Non</option>
              </select>
            </Field>
          </div>
        </fieldset>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={handleSubmit} disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {saving && <Spinner />}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm">Annuler</button>
      </div>
    </div>
  );
}
