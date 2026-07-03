import { useEffect, useState } from 'react';
import {
  listParis,
  createParis,
  updateParis,
  deleteParis,
  displayPatchToParisRecord,
  type ParisDisplayRow,
} from '@/services/paris-service';
import { getResultatEnCoursId } from '@/lib/dimensions';
import { ParisForm } from '@/components/ParisForm';
import { ParisGrid } from '@/components/ParisGrid';
import { Loader2, Plus } from 'lucide-react';
import type { formValuesToParisInput } from '@/lib/paris-form';

// Module-level cache — survives re-renders and component remounts
let _parisCache: ParisDisplayRow[] | null = null;

type FormMode = { kind: 'manual' } | { kind: 'edit'; record: ParisDisplayRow };

export function AdminFactPage() {
  const [rows, setRows] = useState<ParisDisplayRow[]>(_parisCache ?? []);
  const [loading, setLoading] = useState(_parisCache === null);
  const [form, setForm] = useState<FormMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const load = async (forceRefresh = false) => {
    if (_parisCache !== null && !forceRefresh) {
      setRows(_parisCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await listParis();
      _parisCache = data;
      setRows(data);
      setError(null);
      setLastRefreshAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async (input: ReturnType<typeof formValuesToParisInput>) => {
    if (form?.kind === 'edit') {
      await updateParis(form.record.id, input);
    } else {
      await createParis(input);
    }
    setForm(null);
    _parisCache = null;
    await load(true);
  };

  const handleDelete = async (id: string) => {
    await deleteParis(id);
    _parisCache = null;
    await load(true);
  };

  const handleInlineSave = async (id: string, patch: Partial<ParisDisplayRow>) => {
    await updateParis(id, displayPatchToParisRecord(patch));
    _parisCache = null;
    await load(true);
  };

  const handleDuplicate = async (row: ParisDisplayRow) => {
    const enCoursId = getResultatEnCoursId();
    await createParis({
      sourceInsertion: row.sourceInsertion,
      datePari: new Date(),
      idBookmaker: row.idBookmaker,
      idSport: row.idSport,
      libelleCompetition: row.libelleCompetition,
      libelleEvenement: row.libelleEvenement,
      idTypePari: row.idTypePari,
      coteBookmaker: row.coteBookmaker,
      miseEngagee: row.miseEngagee,
      idResultat: enCoursId,
      coteMarcheReference: row.coteMarcheReference,
      coteVraieMpto: row.coteVraieMpto,
      probabiliteImplicite: row.probabiliteImplicite,
      probabiliteReelleMpto: row.probabiliteReelleMpto,
      trjBookmaker: row.trjBookmaker,
      trjPs3838: row.trjPs3838,
      trjMarche: row.trjMarche,
      pourcentageBoost: row.pourcentageBoost,
      critereKelly: row.critereKelly,
      flagSurebet: row.flagSurebet,
    });
    _parisCache = null;
    await load(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">Mes paris</h2>
          <p className="text-[10px] text-muted-foreground">
            En cours en premier · Cliquer une ligne pour éditer · Dupliquer ou supprimer
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshAt && !loading && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Dernière MAJ {lastRefreshAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => { _parisCache = null; void load(true); }}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Actualiser
          </button>
          <button
            type="button"
            onClick={() => setForm({ kind: 'manual' })}
            className="gradient-brand glow-ring inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            <Plus className="h-3.5 w-3.5" /> Nouveau pari
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
      )}

      {form && (
        <ParisForm
          mode={form.kind === 'edit' ? (form.record.sourceInsertion === 'Scrap' ? 'scrap' : 'manual') : 'manual'}
          initialRecord={form.kind === 'edit' ? form.record : undefined}
          onSave={handleSave}
          onCancel={() => setForm(null)}
        />
      )}

      {!loading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun pari — créez-en un manuellement ou enregistrez depuis les cotes collectées.
        </p>
      ) : (
        <ParisGrid
          rows={rows}
          isLoading={loading}
          onDelete={handleDelete}
          onSaveRow={handleInlineSave}
          onDuplicate={handleDuplicate}
        />
      )}
    </div>
  );
}
