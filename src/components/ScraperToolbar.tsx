import { Settings2 } from 'lucide-react';
import type { UserSettings } from '@/lib/user-settings';
import { CompactParamsBar } from '@/components/CompactParamsBar';

interface ScraperToolbarProps {
  settings: UserSettings;
  onSettingsChange: (patch: Partial<UserSettings>) => void;
}

/** Réglages Kelly / mise / zoom — toujours visibles, pas de repli. */
export function ScraperToolbar({ settings, onSettingsChange }: ScraperToolbarProps) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Settings2 className="h-4 w-4 text-primary shrink-0" />
        <h2 className="text-sm font-semibold">Paramètres</h2>
      </div>
      <CompactParamsBar
        kellyFraction={settings.kellyFraction}
        stakeValue={settings.stakeValue}
        tableZoom={settings.tableZoom}
        onKellyChange={(v) => onSettingsChange({ kellyFraction: v })}
        onStakeChange={(v) => onSettingsChange({ stakeValue: v })}
        onZoomChange={(v) => onSettingsChange({ tableZoom: v })}
      />
    </div>
  );
}
