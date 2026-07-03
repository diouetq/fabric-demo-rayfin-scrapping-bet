import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Copy, Trash2, Check, X, Save, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { computeGainNet, type ParisDisplayRow, type ParisSourceInsertion } from '@/services/paris-service';
import { isValidDecimalTyping, parseDecimalInput } from '@/lib/decimal-input';
import { getResultatEnCoursId } from '@/lib/dimensions';
import { useDimensions } from '@/hooks/use-dimensions';

const PAGE_SIZE = 50;

/** Libellés grand public pour la source d'insertion (la valeur BDD 'Scrap' reste inchangée). */
const SOURCE_LABELS: Record<ParisSourceInsertion, string> = {
  Manuel: 'Manuel',
  Scrap: 'Cotes collectées',
  Import: 'Import',
};

type ColDef = {
  id: string;
  label: string;
  get: (b: ParisDisplayRow) => string;
  align?: 'left' | 'center';
  defaultWidth: number;
  sortable?: boolean;
  wrap?: boolean;
};

const MAIN_COLUMNS: ColDef[] = [
  { id: 'source',      label: 'Source',            get: (b) => b.sourceInsertion,                     align: 'center', defaultWidth: 54 },
  { id: 'date',        label: 'Date pari',         get: (b) => b.datePari.toISOString().slice(0, 10),  align: 'center', defaultWidth: 88, sortable: true },
  { id: 'resultat',    label: 'Résultat',          get: (b) => b.resultat,                             align: 'center', defaultWidth: 78, sortable: true },
  { id: 'gain',        label: 'Gain net',          get: (b) => b.gainNet?.toFixed(0) ?? '—',           align: 'center', defaultWidth: 62 },
  { id: 'bookmaker',   label: 'Bookmaker',         get: (b) => b.bookmaker,                            align: 'center', defaultWidth: 90, sortable: true },
  { id: 'sport',       label: 'Sport',             get: (b) => b.sport,                                align: 'center', defaultWidth: 68, sortable: true },
  { id: 'competition', label: 'Compétition',     get: (b) => b.libelleCompetition ?? '',             align: 'center', defaultWidth: 110, wrap: true },
  { id: 'evenement',   label: 'Événement',         get: (b) => b.libelleEvenement,                     align: 'center', defaultWidth: 140, wrap: true },
  { id: 'type_pari',   label: 'Type de pari',      get: (b) => b.typePari,                             align: 'center', defaultWidth: 95 },
  { id: 'cote',        label: 'Cote BM',           get: (b) => b.coteBookmaker.toFixed(3),             align: 'center', defaultWidth: 58 },
  { id: 'mise',        label: 'Mise',              get: (b) => b.miseEngagee.toFixed(2),               align: 'center', defaultWidth: 52 },
  { id: 'cote_ref',    label: 'Cote réf.',         get: (b) => b.coteMarcheReference?.toFixed(3) ?? '', align: 'center', defaultWidth: 58 },
  { id: 'vraie_cote',  label: 'Cote MPTO',         get: (b) => b.coteVraieMpto?.toFixed(3) ?? '',       align: 'center', defaultWidth: 58 },
];

const SCRAP_COLUMNS: ColDef[] = [
  { id: 'prob_impl',  label: 'Prob. implicite',   get: (b) => b.probabiliteImplicite != null ? `${(b.probabiliteImplicite * 100).toFixed(1)}%` : '', align: 'center', defaultWidth: 62 },
  { id: 'prob_relle', label: 'Prob. réelle MPTO', get: (b) => b.probabiliteReelleMpto != null ? `${(b.probabiliteReelleMpto * 100).toFixed(1)}%` : '', align: 'center', defaultWidth: 68 },
  { id: 'trj',        label: 'TRJ marché',        get: (b) => b.trjMarche != null ? `${(b.trjMarche * 100).toFixed(1)}%` : '', align: 'center', defaultWidth: 48 },
  { id: 'boost',      label: '% Boost',           get: (b) => b.pourcentageBoost != null ? `${(b.pourcentageBoost * 100).toFixed(1)}%` : '', align: 'center', defaultWidth: 52 },
  { id: 'kelly',      label: 'Kelly',             get: (b) => b.critereKelly?.toFixed(3) ?? '', align: 'center', defaultWidth: 50 },
  { id: 'trj_bm',     label: 'TRJ bookmaker',     get: (b) => b.trjBookmaker != null ? `${(b.trjBookmaker * 100).toFixed(1)}%` : '', align: 'center', defaultWidth: 56 },
  { id: 'trj_ps',     label: 'TRJ PS3838',        get: (b) => b.trjPs3838 != null ? `${(b.trjPs3838 * 100).toFixed(1)}%` : '', align: 'center', defaultWidth: 68 },
  { id: 'surebet',    label: 'Surebet',           get: (b) => b.flagSurebet == null ? '' : b.flagSurebet ? 'YES' : 'NO', align: 'center', defaultWidth: 48 },
];

type SortState = { colId: string; dir: 'asc' | 'desc' } | null;

/** Filtre-dropdown par colonne — panel en portal pour éviter le clipping overflow */
function ColumnFilter({
  col,
  rows,
  excluded,
  onExcludedChange,
  sortDir,
  onSort,
}: {
  col: ColDef;
  rows: ParisDisplayRow[];
  excluded: string[];
  onExcludedChange: (excluded: string[]) => void;
  sortDir?: 'asc' | 'desc';
  onSort?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const values = useMemo(() => {
    const set = new Set(rows.map((r) => col.get(r) || '(vide)'));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [rows, col]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (filterBtnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = excluded.length > 0;

  const toggleOpen = () => {
    if (!open && filterBtnRef.current) {
      const rect = filterBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((o) => !o);
  };

  const menu = open ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-52 max-h-60 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-xl p-2 text-left font-normal"
      style={{ top: menuPos.top, left: menuPos.left }}
    >
      <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b">
        <button
          type="button"
          className="text-[10px] text-primary hover:underline font-medium"
          onClick={() => onExcludedChange([])}
        >
          Tout inclure
        </button>
        <span className="text-[10px] text-muted-foreground">·</span>
        <button
          type="button"
          className="text-[10px] text-muted-foreground hover:underline"
          onClick={() => onExcludedChange([...values])}
        >
          Tout exclure
        </button>
        {active && (
          <>
            <span className="flex-1" />
            <button
              type="button"
              className="text-[10px] text-destructive hover:underline font-medium"
              onClick={() => { onExcludedChange([]); setOpen(false); }}
            >
              ✕ Effacer
            </button>
          </>
        )}
      </div>
      {values.map((v) => {
        const included = !excluded.includes(v);
        return (
          <label key={v} className="flex items-center gap-1.5 py-0.5 text-[11px] cursor-pointer hover:bg-muted/40 rounded px-0.5">
            <input
              type="checkbox"
              checked={included}
              onChange={() => {
                const next = included ? [...excluded, v] : excluded.filter((x) => x !== v);
                onExcludedChange(next);
              }}
            />
            <span className={`truncate ${!included ? 'line-through text-muted-foreground' : ''}`}>{v}</span>
          </label>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="relative inline-flex items-center gap-0.5 whitespace-nowrap">
      {col.sortable && onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-0.5 hover:text-primary-foreground/80"
        >
          <span>{col.label}</span>
          {sortDir === 'asc' ? (
            <ChevronUp className="h-3 w-3 opacity-80" />
          ) : sortDir === 'desc' ? (
            <ChevronDown className="h-3 w-3 opacity-80" />
          ) : (
            <span className="inline-block w-3" />
          )}
        </button>
      ) : (
        <span>{col.label}</span>
      )}
      <button
        ref={filterBtnRef}
        type="button"
        onClick={toggleOpen}
        className={`rounded p-0.5 transition-colors ${
          active
            ? 'text-amber-300 ring-1 ring-amber-300'
            : 'text-primary-foreground/60 hover:text-primary-foreground hover:bg-white/10'
        }`}
        title="Filtrer"
      >
        <Filter className="h-3 w-3" />
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}

const inputCls = 'w-full rounded border border-input px-1.5 py-0.5 text-[11px] bg-background focus:outline-none focus:ring-1 focus:ring-primary';
const selectCls = 'w-full rounded border border-input px-1 py-0.5 text-[11px] bg-background focus:outline-none focus:ring-1 focus:ring-primary';

/** Champ décimal local (ne se réinitialise pas entre les frappes) */
function LocalDecimalInput({
  label,
  initValue,
  onChange,
  allowNegative,
}: {
  label: string;
  initValue: number | null | undefined;
  onChange: (v: number | undefined) => void;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(initValue != null ? String(initValue) : '');
  const isValidTyping = (raw: string) =>
    allowNegative ? /^-?\d*[.,]?\d*$/.test(raw.trim()) : isValidDecimalTyping(raw);

  return (
    <label className="block">
      <span className="text-[9px] font-bold uppercase text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className={`${inputCls} text-center tabular-nums`}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidTyping(raw)) return;
          setText(raw);
          const n = parseDecimalInput(raw);
          onChange(n ?? undefined);
        }}
      />
    </label>
  );
}

/** Champ pourcentage : affiché ×100, stocké ÷100 */
function LocalPctInput({
  label,
  initValue,
  onChange,
}: {
  label: string;
  initValue: number | null | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(initValue != null ? (initValue * 100).toFixed(2) : '');

  return (
    <label className="block">
      <span className="text-[9px] font-bold uppercase text-muted-foreground">{label} %</span>
      <input
        type="text"
        inputMode="decimal"
        className={`${inputCls} text-center tabular-nums`}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          if (!isValidDecimalTyping(raw)) return;
          setText(raw);
          const n = parseDecimalInput(raw);
          onChange(n != null ? n / 100 : undefined);
        }}
      />
    </label>
  );
}

/** Panneau d'édition compact affiché au-dessus du tableau */
function EditPanel({
  row,
  draft,
  onDraftChange,
  onSave,
  onCancel,
  onDuplicate,
  onDelete,
  saving,
  error,
  dims,
}: {
  row: ParisDisplayRow;
  draft: Partial<ParisDisplayRow>;
  onDraftChange: (patch: Partial<ParisDisplayRow>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  saving: boolean;
  error: string | null;
  dims: {
    bookmakers: Array<{ id: number; nom: string; typeBookmaker: string }>;
    sports: Array<{ id: number; nom: string }>;
    typesPari: Array<{ id: number; libelle: string }>;
    resultats: Array<{ id: number; libelle: string }>;
  } | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2.5">
      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive">
          ✗ Échec de l'enregistrement : {error}
        </p>
      )}
      {/* Barre de titre + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-primary truncate max-w-[60%]">
          ✎ {row.libelleEvenement}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="gradient-brand inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
          >
            {saving ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="h-3 w-3" />}
            Sauvegarder
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
          >
            <Copy className="h-3 w-3" />
            Dupliquer
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="inline-flex items-center gap-1 rounded bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground"
              >
                <Check className="h-3 w-3" />
                Confirmer
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded border px-2 py-0.5 text-[11px] hover:bg-muted"
              >
                Annuler suppr.
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 rounded border border-destructive/50 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" />
              Supprimer
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border px-2 py-0.5 text-[11px] hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Grille de champs — rangée 1 : identité */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        <label className="block">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Date pari</span>
          <input
            type="date"
            className={inputCls}
            value={(draft.datePari ?? row.datePari).toISOString().slice(0, 10)}
            onChange={(e) => onDraftChange({ datePari: new Date(e.target.value + 'T12:00:00') })}
          />
        </label>

        <label className="block">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Bookmaker</span>
          <select
            className={selectCls}
            value={draft.idBookmaker ?? row.idBookmaker}
            onChange={(e) => onDraftChange({ idBookmaker: Number(e.target.value) })}
          >
            {dims?.bookmakers.map((b) => (
              <option key={b.id} value={b.id}>{b.nom}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Sport</span>
          <select
            className={selectCls}
            value={draft.idSport ?? row.idSport}
            onChange={(e) => onDraftChange({ idSport: Number(e.target.value) })}
          >
            {dims?.sports.map((s) => (
              <option key={s.id} value={s.id}>{s.nom}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Type pari</span>
          <select
            className={selectCls}
            value={draft.idTypePari ?? row.idTypePari}
            onChange={(e) => onDraftChange({ idTypePari: Number(e.target.value) })}
          >
            {dims?.typesPari.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Résultat</span>
          <select
            className={selectCls}
            value={draft.idResultat ?? row.idResultat ?? getResultatEnCoursId()}
            onChange={(e) => onDraftChange({ idResultat: Number(e.target.value) })}
          >
            {dims?.resultats.map((r) => (
              <option key={r.id} value={r.id}>{r.libelle}</option>
            ))}
          </select>
        </label>

        <label className="block col-span-2">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Compétition</span>
          <input
            type="text"
            className={inputCls}
            value={String(draft.libelleCompetition ?? row.libelleCompetition ?? '')}
            onChange={(e) => onDraftChange({ libelleCompetition: e.target.value || undefined })}
          />
        </label>

        <label className="block col-span-3">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Événement</span>
          <input
            type="text"
            className={inputCls}
            value={String(draft.libelleEvenement ?? row.libelleEvenement)}
            onChange={(e) => onDraftChange({ libelleEvenement: e.target.value })}
          />
        </label>

        <LocalDecimalInput
          label="Cote BM"
          initValue={draft.coteBookmaker ?? row.coteBookmaker}
          onChange={(n) => { if (n != null) onDraftChange({ coteBookmaker: n }); }}
        />

        <LocalDecimalInput
          label="Mise €"
          initValue={draft.miseEngagee ?? row.miseEngagee}
          onChange={(n) => { if (n != null && n > 0) onDraftChange({ miseEngagee: n }); }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        Gain net : <GainCell
          gainNet={computeGainNet({
            idResultat: draft.idResultat ?? row.idResultat,
            idTypePari: draft.idTypePari ?? row.idTypePari,
            coteBookmaker: draft.coteBookmaker ?? row.coteBookmaker,
            miseEngagee: draft.miseEngagee ?? row.miseEngagee,
          })}
          idResultat={draft.idResultat ?? row.idResultat}
        /> — calculé automatiquement à partir du résultat, non modifiable.
      </p>

      {/* Rangée scrap */}
      <details className="group">
        <summary className="cursor-pointer text-[10px] font-semibold text-muted-foreground hover:text-foreground select-none">
          ▸ Champs automatiques
        </summary>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          <LocalDecimalInput
            label="Cote réf."
            initValue={draft.coteMarcheReference ?? row.coteMarcheReference}
            onChange={(n) => onDraftChange({ coteMarcheReference: n })}
          />
          <LocalDecimalInput
            label="Vraie cote"
            initValue={draft.coteVraieMpto ?? row.coteVraieMpto}
            onChange={(n) => onDraftChange({ coteVraieMpto: n })}
          />
          <LocalPctInput
            label="Prob. impl."
            initValue={draft.probabiliteImplicite ?? row.probabiliteImplicite}
            onChange={(n) => onDraftChange({ probabiliteImplicite: n })}
          />
          <LocalPctInput
            label="Prob. réelle"
            initValue={draft.probabiliteReelleMpto ?? row.probabiliteReelleMpto}
            onChange={(n) => onDraftChange({ probabiliteReelleMpto: n })}
          />
          <LocalPctInput
            label="TRJ BM"
            initValue={draft.trjBookmaker ?? row.trjBookmaker}
            onChange={(n) => onDraftChange({ trjBookmaker: n })}
          />
          <LocalPctInput
            label="TRJ PS"
            initValue={draft.trjPs3838 ?? row.trjPs3838}
            onChange={(n) => onDraftChange({ trjPs3838: n })}
          />
          <LocalPctInput
            label="TRJ marché"
            initValue={draft.trjMarche ?? row.trjMarche}
            onChange={(n) => onDraftChange({ trjMarche: n })}
          />
          <LocalPctInput
            label="Boost"
            initValue={draft.pourcentageBoost ?? row.pourcentageBoost}
            onChange={(n) => onDraftChange({ pourcentageBoost: n })}
          />
          <LocalDecimalInput
            label="Kelly"
            initValue={draft.critereKelly ?? row.critereKelly}
            onChange={(n) => onDraftChange({ critereKelly: n })}
          />

          <label className="block">
            <span className="text-[9px] font-bold uppercase text-muted-foreground">Surebet</span>
            <select
              className={selectCls}
              value={
                (draft.flagSurebet ?? row.flagSurebet) == null
                  ? ''
                  : (draft.flagSurebet ?? row.flagSurebet) ? '1' : '0'
              }
              onChange={(e) =>
                onDraftChange({
                  flagSurebet: e.target.value === '' ? undefined : e.target.value === '1',
                })
              }
            >
              <option value="">—</option>
              <option value="1">Oui</option>
              <option value="0">Non</option>
            </select>
          </label>

          <label className="block col-span-2">
            <span className="text-[9px] font-bold uppercase text-muted-foreground">Maj auto.</span>
            <input
              type="datetime-local"
              className={inputCls}
              value={
                (draft.dateHeureMajScrap ?? row.dateHeureMajScrap)
                  ? (draft.dateHeureMajScrap ?? row.dateHeureMajScrap)!
                    .toISOString()
                    .slice(0, 16)
                  : ''
              }
              onChange={(e) =>
                onDraftChange({
                  dateHeureMajScrap: e.target.value ? new Date(e.target.value) : undefined,
                })
              }
            />
          </label>
        </div>
      </details>
    </div>
  );
}

export function ParisGrid({
  rows,
  isLoading = false,
  onDelete,
  onSaveRow,
  onDuplicate,
}: {
  rows: ParisDisplayRow[];
  isLoading?: boolean;
  onDelete: (id: string) => void;
  onSaveRow?: (id: string, patch: Partial<ParisDisplayRow>) => Promise<void>;
  onDuplicate?: (row: ParisDisplayRow) => Promise<void>;
}) {
  const { dims } = useDimensions();
  const [excludedByCol, setExcludedByCol] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ParisDisplayRow>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState>(null);
  const [flashedId, setFlashedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showScrap, setShowScrap] = useState(false);
  const [enCoursOnly, setEnCoursOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(80);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scale = zoom / 100;

  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries([...MAIN_COLUMNS, ...SCRAP_COLUMNS].map((c) => [c.id, c.defaultWidth]))
  );
  const colWidthsRef = useRef(colWidths);
  colWidthsRef.current = colWidths;

  const prevRowIdsRef = useRef<Set<string>>(new Set());
  const detectNewRowRef = useRef(false);

  const prevRows = useRef(rows);
  if (prevRows.current !== rows) {
    prevRows.current = rows;
    if (detectNewRowRef.current) {
      const currentIds = new Set(rows.map((r) => r.id));
      const newId = [...currentIds].find((id) => !prevRowIdsRef.current.has(id));
      if (newId) {
        detectNewRowRef.current = false;
        setFlashedId(newId);
        setTimeout(() => setFlashedId(null), 2000);
      }
    }
  }

  const enCoursId = getResultatEnCoursId();

  const visibleColumns = useMemo(
    () => (showScrap ? [...MAIN_COLUMNS, ...SCRAP_COLUMNS] : MAIN_COLUMNS),
    [showScrap],
  );

  // Reset to page 1 whenever filters or en-cours toggle change
  useEffect(() => {
    setCurrentPage(1);
  }, [excludedByCol, enCoursOnly]);

  const handleSort = useCallback((colId: string) => {
    setSortState((prev) => {
      if (prev?.colId === colId) {
        if (prev.dir === 'asc') return { colId, dir: 'desc' };
        return null;
      }
      return { colId, dir: 'asc' };
    });
  }, []);

  const handleExcludedChange = useCallback((colId: string, ex: string[]) => {
    setExcludedByCol((p) => ({ ...p, [colId]: ex }));
  }, []);

  const toggleEnCours = useCallback(() => {
    setEnCoursOnly((p) => !p);
  }, []);

  const handleResizeStart = useCallback((colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = colWidthsRef.current[colId] ?? 80;
    const startX = e.clientX;

    const onMouseMove = (me: MouseEvent) => {
      const newWidth = Math.max(40, startWidth + (me.clientX - startX));
      setColWidths((prev) => ({ ...prev, [colId]: newWidth }));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Default sort: En cours first, then date desc — then user sort on top
  const sorted = useMemo(() => {
    const base = [...rows].sort((a, b) => {
      const aEnCours = a.idResultat == null || a.idResultat === enCoursId;
      const bEnCours = b.idResultat == null || b.idResultat === enCoursId;
      if (aEnCours !== bEnCours) return aEnCours ? -1 : 1;
      return b.datePari.getTime() - a.datePari.getTime();
    });
    if (!sortState) return base;
    const col = visibleColumns.find((c) => c.id === sortState.colId);
    if (!col) return base;
    return [...base].sort((a, b) => {
      const cmp = col.get(a).localeCompare(col.get(b), 'fr', { numeric: true });
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortState, enCoursId, visibleColumns]);

  // Quick "En cours only" filter
  const enCoursFiltered = useMemo(() => {
    if (!enCoursOnly) return sorted;
    return sorted.filter((r) => r.idResultat == null || r.idResultat === enCoursId);
  }, [sorted, enCoursOnly, enCoursId]);

  // Column filters (apply only on visible columns)
  const filtered = useMemo(
    () =>
      enCoursFiltered.filter((row) =>
        visibleColumns.every((col) => {
          const ex = excludedByCol[col.id];
          if (!ex?.length) return true;
          return !ex.includes(col.get(row) || '(vide)');
        }),
      ),
    [enCoursFiltered, excludedByCol, visibleColumns],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const selectedRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null;

  const startEdit = (row: ParisDisplayRow) => {
    setSelectedId(row.id);
    setDraft({});
    setSaveError(null);
  };

  const cancelEdit = () => {
    setSelectedId(null);
    setDraft({});
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!selectedRow || !onSaveRow) { cancelEdit(); return; }
    if (!Object.keys(draft).length) { cancelEdit(); return; }
    const savedId = selectedRow.id;
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveRow(savedId, draft);
      cancelEdit();
      setFlashedId(savedId);
      setTimeout(() => setFlashedId(null), 2500);
      setToastMsg('✓ Pari mis à jour');
      setTimeout(() => setToastMsg(null), 2500);
      setTimeout(() => {
        document.getElementById(`pari-row-${savedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedRow || !onDuplicate) return;
    prevRowIdsRef.current = new Set(rows.map((r) => r.id));
    detectNewRowRef.current = true;
    setSaving(true);
    try {
      await onDuplicate(selectedRow);
      cancelEdit();
      setToastMsg('✓ Ligne dupliquée');
      setTimeout(() => setToastMsg(null), 2500);
    } catch {
      detectNewRowRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    if (selectedId === id) cancelEdit();
  };

  // Main cols fill container width; scrap cols are extra scrollable width
  const mainColPx = useMemo(() => {
    const map: Record<string, number> = {};
    const totalUser = MAIN_COLUMNS.reduce((s, c) => s + (colWidths[c.id] ?? c.defaultWidth), 0);
    const baseWidth = Math.max(containerWidth, 400);
    for (const c of MAIN_COLUMNS) {
      const w = colWidths[c.id] ?? c.defaultWidth;
      // Colonnes de base = toujours 100% du viewport (sans scale sur la largeur)
      map[c.id] = Math.round((w / totalUser) * baseWidth);
    }
    return map;
  }, [colWidths, containerWidth]);

  const scrapColPx = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of SCRAP_COLUMNS) {
      map[c.id] = Math.round((colWidths[c.id] ?? c.defaultWidth) * scale);
    }
    return map;
  }, [colWidths, scale]);

  const scrapTotalWidth = showScrap
    ? SCRAP_COLUMNS.reduce((s, c) => s + scrapColPx[c.id], 0)
    : 0;
  const mainTotalWidth = MAIN_COLUMNS.reduce((s, c) => s + mainColPx[c.id], 0);
  const tableMinWidth = showScrap ? mainTotalWidth + scrapTotalWidth : undefined;

  const fontSize = `${Math.round(11 * scale)}px`;
  const cellPad = `${Math.round(2 * scale)}px ${Math.round(4 * scale)}px`;

  return (
    <div className="space-y-2">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-lg animate-in slide-in-from-bottom-2">
          {toastMsg}
        </div>
      )}

      {/* Panneau d'édition */}
      {selectedRow && (
        <EditPanel
          key={selectedId}
          row={selectedRow}
          draft={draft}
          onDraftChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          onSave={() => void saveEdit()}
          onCancel={cancelEdit}
          onDuplicate={() => void handleDuplicate()}
          onDelete={() => void handleDelete(selectedRow.id)}
          saving={saving}
          error={saveError}
          dims={dims}
        />
      )}

      {/* Barre d'outils — même style que Scraper */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-2 py-1.5">
        <button
          type="button"
          onClick={toggleEnCours}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
            enCoursOnly
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-background text-foreground border border-input hover:bg-muted'
          }`}
        >
          En cours seulement
        </button>

        <button
          type="button"
          onClick={() => setShowScrap((p) => !p)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
            showScrap
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-background text-foreground border border-input hover:bg-muted'
          }`}
        >
          {showScrap ? 'Masquer les colonnes automatiques' : 'Afficher les colonnes automatiques'}
        </button>

        <div className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-2 py-0.5 text-[11px] ml-auto">
          <ZoomOut className="h-3 w-3 text-muted-foreground" />
          <input
            type="range"
            min={60}
            max={120}
            step={5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20 accent-primary"
          />
          <ZoomIn className="h-3 w-3 text-muted-foreground" />
          <span className="tabular-nums text-muted-foreground w-8 text-center">{zoom}%</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card w-full">
        <p className="text-[10px] text-muted-foreground px-2 py-1 bg-muted/30 border-b border-border flex items-center gap-2">
          <span>
            {isLoading
              ? `Chargement… (${rows.length} lignes en cache)`
              : `${filtered.length} / ${rows.length} lignes · Page ${safePage}/${totalPages}`}
          </span>
          <span className="text-muted-foreground/60">· Cliquer une ligne pour éditer · Filtres (▾) · Tri · Redimensionner</span>
          {showScrap && (
            <span className="ml-auto text-primary font-medium">↔ Défilement horizontal pour les colonnes automatiques</span>
          )}
        </p>
        <div
          ref={scrollRef}
          className={`max-h-[calc(100vh-280px)] overflow-y-auto ${showScrap ? 'overflow-x-scroll' : 'overflow-x-hidden'}`}
        >
          <table
            className="border-collapse [&_td]:align-middle [&_th]:align-middle"
            style={{
              fontSize,
              tableLayout: 'fixed',
              width: showScrap ? `${tableMinWidth}px` : '100%',
              minWidth: showScrap ? `${tableMinWidth}px` : '100%',
            }}
          >
            <colgroup>
              {MAIN_COLUMNS.map((c) => (
                <col key={c.id} style={{ width: `${mainColPx[c.id]}px` }} />
              ))}
              {showScrap && SCRAP_COLUMNS.map((c) => (
                <col key={c.id} style={{ width: `${scrapColPx[c.id]}px` }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
              <tr>
                {MAIN_COLUMNS.map((col) => (
                  <th
                    key={col.id}
                    className="font-semibold text-center relative select-none overflow-hidden"
                    style={{ padding: cellPad }}
                  >
                    <ColumnFilter
                      col={col}
                      rows={rows}
                      excluded={excludedByCol[col.id] ?? []}
                      onExcludedChange={(ex) => handleExcludedChange(col.id, ex)}
                      sortDir={sortState?.colId === col.id ? sortState.dir : undefined}
                      onSort={col.sortable ? () => handleSort(col.id) : undefined}
                    />
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 active:bg-white/30"
                      onMouseDown={(e) => handleResizeStart(col.id, e)}
                    />
                  </th>
                ))}
                {showScrap && SCRAP_COLUMNS.map((col) => (
                  <th
                    key={col.id}
                    className="font-semibold text-center relative select-none overflow-hidden bg-primary/90"
                    style={{ padding: cellPad }}
                  >
                    <ColumnFilter
                      col={col}
                      rows={rows}
                      excluded={excludedByCol[col.id] ?? []}
                      onExcludedChange={(ex) => handleExcludedChange(col.id, ex)}
                    />
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-white/20 active:bg-white/30"
                      onMouseDown={(e) => handleResizeStart(col.id, e)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && rows.length === 0
                ? Array.from({ length: 10 }).map((_, i) => (
                    <SkeletonRow key={i} cols={MAIN_COLUMNS.length + (showScrap ? SCRAP_COLUMNS.length : 0)} />
                  ))
                : paginated.map((b, rowIdx) => {
                    const isSelected = selectedId === b.id;
                    const isFlashed = flashedId === b.id;
                    const isEnCours = b.idResultat == null || b.idResultat === enCoursId;
                    const isOdd = rowIdx % 2 === 0;
                    const rowCols = [...MAIN_COLUMNS, ...(showScrap ? SCRAP_COLUMNS : [])];

                    return (
                      <tr
                        key={b.id}
                        id={`pari-row-${b.id}`}
                        onClick={() => startEdit(b)}
                        className={[
                          'border-t cursor-pointer transition-colors',
                          isFlashed
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 ring-1 ring-inset ring-emerald-500/50'
                            : isSelected
                              ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                              : isEnCours
                                ? 'bg-amber-50/80 dark:bg-amber-900/20 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                                : isOdd
                                  ? 'bg-muted/5 hover:bg-muted/30'
                                  : 'hover:bg-muted/20',
                        ].join(' ')}
                      >
                        {rowCols.map((col, colIdx) => (
                          <td
                            key={col.id}
                            className={[
                              'align-middle text-center',
                              colIdx === 0 && isEnCours ? 'border-l-2 border-l-amber-400 dark:border-l-amber-500' : '',
                              col.wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap tabular-nums',
                            ].join(' ')}
                            style={{ padding: cellPad, maxWidth: col.wrap ? `${mainColPx[col.id] ?? scrapColPx[col.id]}px` : undefined }}
                            title={col.wrap ? undefined : col.get(b)}
                          >
                            {col.id === 'source' ? (
                              <span className="text-[9px] text-muted-foreground">
                                {SOURCE_LABELS[b.sourceInsertion] ?? b.sourceInsertion}
                              </span>
                            ) : col.id === 'resultat' ? (
                              <ResultatCell resultat={b.resultat} isEnCours={isEnCours} />
                            ) : col.id === 'gain' ? (
                              <GainCell gainNet={b.gainNet} idResultat={b.idResultat} />
                            ) : col.id === 'surebet' ? (
                              <span className={b.flagSurebet ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}>
                                {col.get(b) || '—'}
                              </span>
                            ) : (
                              col.get(b) || '—'
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-3 py-2 border-t bg-muted/20 text-[11px]">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3 w-3" />
              Précédent
            </button>
            <span className="text-muted-foreground font-medium tabular-nums">
              Page {safePage} / {totalPages}
              <span className="ml-2 text-[10px] font-normal">({filtered.length} lignes)</span>
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suivant
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-t animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-1.5 py-1.5">
          <div className="h-3 rounded bg-muted/60" style={{ width: i === 0 ? '50%' : i % 3 === 0 ? '80%' : '65%' }} />
        </td>
      ))}
    </tr>
  );
}

function ResultatCell({ resultat, isEnCours }: { resultat: string; isEnCours: boolean }) {
  const text = resultat || '—';
  if (isEnCours) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-400">
        <span className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-amber-500" />
        {text}
      </span>
    );
  }
  const r = resultat.toLowerCase();
  if (r.includes('gagn')) {
    return (
      <span className="text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 rounded px-1">
        {text}
      </span>
    );
  }
  if (r.includes('perdu') || r.includes('perd')) {
    return (
      <span className="text-red-600 font-semibold bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded px-1">
        {text}
      </span>
    );
  }
  if (r.includes('rembours')) {
    return (
      <span className="text-amber-600 font-semibold bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 rounded px-1">
        {text}
      </span>
    );
  }
  return <span className="text-muted-foreground italic">{text}</span>;
}

function GainCell({ gainNet, idResultat }: { gainNet: number | undefined | null; idResultat?: number }) {
  if (gainNet == null || idResultat == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const cls = gainNet > 0
    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
    : gainNet === 0 && idResultat === 2
      ? 'text-red-600 dark:text-red-400 font-semibold'
      : 'text-muted-foreground';
  return <span className={cls}>{Math.round(gainNet).toFixed(0)} €</span>;
}
