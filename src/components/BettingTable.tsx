import { useMemo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import {
  type ComputedBettingRow,
  formatDateTime,
  formatEuro,
  formatOdds,
  formatPct,
  getRowHighlight,
  competitionGroupKey,
} from '@/lib/betting-calculations';
import type { OddsChange } from '@/lib/scrape-persistence';
import { rowOddsKey } from '@/lib/scrape-persistence';
import { BookmarkPlus, TrendingDown, TrendingUp, Sparkles } from 'lucide-react';

export function makeRowKey(row: {
  bookmaker: string;
  competition: string;
  evenement: string;
  competiteur: string;
}): string {
  return rowOddsKey(row);
}

function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function isValidDecimalTyping(raw: string): boolean {
  return /^\d*[.,]?\d*$/.test(raw.trim());
}

/** Cote BM cell — shows current odds with trend indicator + previous odds (barré) */
function OddsBmCell({ change, fallbackCote }: { change?: OddsChange; fallbackCote: number }) {
  const delta = change?.delta;
  const current = change?.current ?? fallbackCote;
  const previous = change?.previous;

  return (
    <div className="flex flex-col items-center gap-0 leading-tight">
      <span
        className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
          delta === 'up' ? 'text-emerald-600 dark:text-emerald-400'
            : delta === 'down' ? 'text-red-600 dark:text-red-400'
            : ''
        }`}
      >
        {delta === 'up' && <TrendingUp className="h-2.5 w-2.5 shrink-0" />}
        {delta === 'down' && <TrendingDown className="h-2.5 w-2.5 shrink-0" />}
        {delta === 'new' && <Sparkles className="h-2.5 w-2.5 text-blue-500 shrink-0" />}
        {formatOdds(current)}
      </span>
      {previous != null && (delta === 'up' || delta === 'down') && (
        <span className="text-[9px] text-muted-foreground line-through tabular-nums">
          {formatOdds(previous)}
        </span>
      )}
    </div>
  );
}

/** Input de cote marché référence avec navigation clavier Excel-like */
function CoteMarcheInput({
  value,
  onChange,
  setRef,
  onNavigate,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  setRef?: (el: HTMLInputElement | null) => void;
  onNavigate?: (dir: 'up' | 'down' | 'next' | 'prev') => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');

  useEffect(() => {
    setText(value != null ? String(value) : '');
  }, [value]);

  return (
    <input
      ref={setRef}
      type="text"
      inputMode="decimal"
      lang="fr"
      placeholder="—"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (!isValidDecimalTyping(raw)) return;
        setText(raw);
        onChange(parseDecimalInput(raw));
      }}
      onFocus={(e) => {
        e.target.select();
      }}
      onKeyDown={(e) => {
        if (!onNavigate) return;
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          onNavigate('down');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          onNavigate('up');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          onNavigate(e.shiftKey ? 'prev' : 'next');
        }
      }}
      onBlur={() => {
        const parsed = parseDecimalInput(text);
        if (parsed != null) setText(String(parsed));
        else if (text.trim() === '') setText('');
      }}
      className="block w-full mx-auto rounded border border-input bg-background px-1 py-0.5 text-center text-[length:inherit] tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/70 focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

interface BettingTableProps {
  rows: ComputedBettingRow[];
  onCoteMarcheChange: (rowKey: string, value: number | null) => void;
  onSaveBet: (row: ComputedBettingRow) => void;
  zoom?: number;
  showCompetition?: boolean;
  focusCompetitionKey?: string;
  oddsChanges?: Record<string, OddsChange>;
}

type HighlightType = ReturnType<typeof getRowHighlight>;

const HIGHLIGHT_BG: Record<HighlightType, string> = {
  surebet: 'bg-emerald-100 dark:bg-emerald-950/50',
  boost:   'bg-amber-100 dark:bg-amber-950/40',
  neutral: '',
};

/** Colonnes avec leurs largeurs en px (pour scale = 1.0) */
const COL_DEFS = [
  { key: 'cutoff',   label: 'Cutoff',           w: 66  },
  { key: 'bm',       label: 'Source BM',         w: 74  },
  { key: 'compet',   label: 'Compétition',       w: 100 }, // conditionally hidden
  { key: 'event',    label: 'Événement',         w: 155 }, // text-wrap
  { key: 'comp',     label: 'Compétiteur',       w: 130 }, // text-wrap
  { key: 'coteBm',   label: 'Cote BM',           w: 60  },
  { key: 'ref',      label: 'Cote PS3838',       w: 70  },
  { key: 'trueO',    label: 'Cote MPTO',         w: 54  },
  { key: 'impliedP', label: 'Prob. implicite',   w: 60  },
  { key: 'trueP',    label: 'Prob. réelle MPTO', w: 68  },
  { key: 'trj',      label: 'TRJ marché',        w: 48  },
  { key: 'boost',    label: '% Boost',           w: 52  },
  { key: 'kelly',    label: 'Kelly',             w: 50  },
  { key: 'mise',     label: 'Mise',              w: 54  },
  { key: 'gain',     label: 'Gain potentiel',    w: 72  },
  { key: 'sb',       label: 'Surebet',           w: 48  },
  { key: 'trjBook',  label: 'TRJ bookmaker',     w: 56  },
  { key: 'trjPs',    label: 'TRJ PS3838',        w: 68  },
  { key: 'save',     label: '',                  w: 28  },
] as const;

export function BettingTable({
  rows,
  onCoteMarcheChange,
  onSaveBet,
  zoom = 75,
  showCompetition = true,
  focusCompetitionKey,
  oddsChanges = {},
}: BettingTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const scale = zoom / 100;

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const aTime = a.cutoff?.getTime() ?? Infinity;
        const bTime = b.cutoff?.getTime() ?? Infinity;
        if (aTime !== bTime) return aTime - bTime;
        const ck = competitionGroupKey(a).localeCompare(competitionGroupKey(b));
        if (ck !== 0) return ck;
        return a.evenement.localeCompare(b.evenement);
      }),
    [rows],
  );

  /** Indices de groupe H2H (même événement + compétition = même groupe) */
  const { groupIndices, groupStarts } = useMemo(() => {
    const indices = new Map<string, number>();
    const starts = new Map<string, boolean>();
    let idx = 0;
    let prevMatchKey = '';
    for (const row of sorted) {
      const rk = makeRowKey(row);
      const matchKey = `${competitionGroupKey(row)}||${row.evenement}`;
      if (matchKey !== prevMatchKey) {
        idx++;
        prevMatchKey = matchKey;
        if (indices.size > 0) starts.set(rk, true);
        else starts.set(rk, false);
      } else {
        starts.set(rk, false);
      }
      indices.set(rk, idx);
    }
    return { groupIndices: indices, groupStarts: starts };
  }, [sorted]);

  const firstRowByComp = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of sorted) {
      const ck = competitionGroupKey(row);
      if (!m.has(ck)) m.set(ck, makeRowKey(row));
    }
    return m;
  }, [sorted]);

  const navigateTo = useCallback(
    (currentKey: string, dir: 'up' | 'down' | 'next' | 'prev') => {
      const idx = sorted.findIndex((r) => makeRowKey(r) === currentKey);
      if (idx < 0) return;
      const targetIdx = dir === 'down' || dir === 'next' ? idx + 1 : idx - 1;
      if (targetIdx >= 0 && targetIdx < sorted.length) {
        const targetKey = makeRowKey(sorted[targetIdx]);
        const el = inputRefs.current.get(targetKey);
        if (el) {
          el.focus();
          requestAnimationFrame(() => el.select());
        }
      }
    },
    [sorted],
  );

  useEffect(() => {
    if (!focusCompetitionKey || !containerRef.current) return;
    const anchorId = `comp-${focusCompetitionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    requestAnimationFrame(() => {
      containerRef.current?.querySelector(`#${anchorId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [focusCompetitionKey, sorted]);

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Aucune cote.</p>;
  }

  const fontSize = `${Math.round(11 * scale)}px`;
  const cellPad = `${Math.round(2 * scale)}px ${Math.round(4 * scale)}px`;

  // Filtre la colonne compétition si demandé
  const visibleCols = COL_DEFS.filter((c) => c.key !== 'compet' || showCompetition);

  return (
    <div
      ref={containerRef}
      className="overflow-auto max-h-[calc(100vh-240px)] rounded-lg border border-border bg-card"
      style={{ fontSize }}
    >
      <table
        className="border-collapse w-full [&_td]:align-middle [&_th]:align-middle"
        style={{
          tableLayout: 'fixed',
          minWidth: `${visibleCols.reduce((s, c) => s + (c.w || 90), 0) * scale}px`,
        }}
      >
        <colgroup>
          {visibleCols.map((c) => (
            <col
              key={c.key}
              style={c.w ? { width: `${Math.round(c.w * scale)}px` } : undefined}
            />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
          <tr>
            {visibleCols.map((c) => (
              <th
                key={c.key}
                title={c.key === 'save' ? 'Enregistrer dans la base' : undefined}
                className="font-semibold text-center whitespace-nowrap leading-tight select-none"
                style={{ padding: cellPad }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = makeRowKey(row);
            const ck = competitionGroupKey(row);
            const highlight = getRowHighlight(row);
            const isFocused = focusCompetitionKey === ck;
            const isGroupStart = groupStarts.get(key) === true;
            const isEvenGroup = (groupIndices.get(key) ?? 0) % 2 === 0;

            const anchorId =
              firstRowByComp.get(ck) === key
                ? `comp-${ck.replace(/[^a-zA-Z0-9_-]/g, '_')}`
                : undefined;

            const cells: ReactNode[] = [
              <td key="cutoff" className="text-center align-middle whitespace-nowrap leading-tight" style={{ padding: cellPad }}>
                {formatDateTime(row.cutoff)}
              </td>,
              <td key="bm" className="text-center align-middle truncate leading-tight font-medium" style={{ padding: cellPad }}>
                {row.bookmaker}
              </td>,
              ...(showCompetition ? [
                <td key="compet" className="text-center align-middle truncate leading-tight text-muted-foreground" style={{ padding: cellPad }}>
                  {row.competition}
                </td>,
              ] : []),
              <td key="event" className="text-center align-middle leading-tight" style={{ padding: cellPad }}>
                <div className="whitespace-normal break-words">{row.evenement}</div>
              </td>,
              <td key="comp" className="text-center align-middle leading-tight" style={{ padding: cellPad }}>
                <div className="whitespace-normal break-words">{row.competiteur}</div>
              </td>,
              <td key="coteBm" className="text-center align-middle" style={{ padding: cellPad }}>
                <OddsBmCell change={oddsChanges[key]} fallbackCote={row.cote} />
              </td>,
              <td key="ref" className="text-center align-middle" style={{ padding: cellPad }}>
                <CoteMarcheInput
                  value={row.coteMarcheReference}
                  onChange={(v) => onCoteMarcheChange(key, v)}
                  setRef={(el) => {
                    if (el) inputRefs.current.set(key, el);
                    else inputRefs.current.delete(key);
                  }}
                  onNavigate={(dir) => navigateTo(key, dir)}
                />
              </td>,
              <td key="trueO"    className="text-center align-middle tabular-nums" style={{ padding: cellPad }}>{formatOdds(row.trueOddsMpto)}</td>,
              <td key="impliedP" className="text-center align-middle tabular-nums text-muted-foreground" style={{ padding: cellPad }}>{formatPct(row.impliedProb)}</td>,
              <td key="trueP"    className="text-center align-middle tabular-nums text-muted-foreground" style={{ padding: cellPad }}>{formatPct(row.trueProbMpto)}</td>,
              <td key="trj"      className="text-center align-middle tabular-nums" style={{ padding: cellPad }}>{formatPct(row.trj)}</td>,
              <td key="boost"    className={`text-center align-middle tabular-nums ${row.boostPct != null && row.boostPct > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}`} style={{ padding: cellPad }}>{formatPct(row.boostPct)}</td>,
              <td key="kelly"    className="text-center align-middle tabular-nums" style={{ padding: cellPad }}>{formatPct(row.kelly)}</td>,
              <td key="mise"     className="text-center align-middle tabular-nums font-medium" style={{ padding: cellPad }}>{formatEuro(row.stake)}</td>,
              <td key="gain"     className="text-center align-middle tabular-nums" style={{ padding: cellPad }}>{formatEuro(row.potentialPayout)}</td>,
              <td key="sb"       className={`text-center align-middle font-semibold ${row.surebet === 'YES' ? 'text-emerald-600 dark:text-emerald-400' : row.surebet === 'NO' ? 'text-muted-foreground' : ''}`} style={{ padding: cellPad }}>
                {row.surebet ?? '—'}
              </td>,
              <td key="trjBook"  className="text-center align-middle tabular-nums text-muted-foreground" style={{ padding: cellPad }}>{formatPct(row.trjBook)}</td>,
              <td key="trjPs"    className="text-center align-middle tabular-nums text-muted-foreground" style={{ padding: cellPad }}>{formatPct(row.trjPs3838)}</td>,
              <td key="save"     className="text-center align-middle" style={{ padding: cellPad }}>
                <button
                  type="button"
                  onClick={() => onSaveBet(row)}
                  title="Enregistrer cette ligne dans la base de données (onglet Mes paris)"
                  className="mx-auto block rounded p-0.5 text-primary hover:bg-primary/10 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                </button>
              </td>,
            ];

            const rowCls = [
              isGroupStart
                ? 'border-t-2 border-t-muted-foreground/25'
                : 'border-t border-border',
              highlight !== 'neutral'
                ? HIGHLIGHT_BG[highlight]
                : isEvenGroup ? 'bg-muted/5' : 'bg-card',
              isFocused ? 'ring-1 ring-inset ring-primary/40' : '',
            ].filter(Boolean).join(' ');

            return (
              <tr key={key} id={anchorId} className={rowCls}>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
