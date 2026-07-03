interface CompactParamsBarProps {
  kellyFraction: number;
  stakeValue: number;
  tableZoom: number;
  onKellyChange: (v: number) => void;
  onStakeChange: (v: number) => void;
  onZoomChange: (v: number) => void;
}

export function CompactParamsBar({
  kellyFraction,
  stakeValue,
  tableZoom,
  onKellyChange,
  onStakeChange,
  onZoomChange,
}: CompactParamsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs">
      <label className="flex items-center gap-1.5 text-foreground">
        Kelly ÷
        <input
          type="number"
          min={1}
          value={kellyFraction}
          onChange={(e) => onKellyChange(Number(e.target.value) || 4)}
          className="w-12 rounded border border-input bg-background px-1 py-0.5 text-center text-foreground"
        />
      </label>

      <label className="flex items-center gap-1.5 text-foreground">
        1 Unité €
        <input
          type="text"
          inputMode="decimal"
          lang="fr"
          value={stakeValue}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.');
            if (!/^\d*[.,]?\d*$/.test(raw)) return;
            const n = Number(raw);
            if (raw !== '' && (!Number.isFinite(n) || n <= 0)) return;
            onStakeChange(raw === '' ? 25 : n);
          }}
          className="w-16 rounded border border-input bg-background px-1 py-0.5 text-center text-foreground"
        />
      </label>

      <label className="flex items-center gap-1.5 text-foreground min-w-[140px]">
        Zoom
        <input
          type="range"
          min={50}
          max={100}
          step={5}
          value={tableZoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-20 accent-primary"
        />
        <span className="w-8 text-right">{tableZoom}%</span>
      </label>
    </div>
  );
}
