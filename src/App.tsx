import { useState, useCallback } from 'react';
import { loadSportIdConfig, saveSportIdConfig, type SportIdConfig } from '@/lib/scrapers';
import { loadUserSettings, saveUserSettings, type UserSettings } from '@/lib/user-settings';
import { useDimensions } from '@/hooks/use-dimensions';
import { ScraperToolbar } from '@/components/ScraperToolbar';
import { ScraperPage } from '@/pages/ScraperPage';
import { AdminFactPage } from '@/pages/AdminFactPage';
import { KpiPage } from '@/pages/KpiPage';
import { DataDictionaryButton } from '@/components/DataDictionary';
import { Trophy, BarChart3, Database, Zap } from 'lucide-react';

type AppPage = 'scraper' | 'admin' | 'kpi';

function App() {
  const [page, setPage] = useState<AppPage>('scraper');
  const [sportConfig, setSportConfig] = useState<SportIdConfig>(loadSportIdConfig);
  const [settings, setSettings] = useState<UserSettings>(loadUserSettings);
  const { dims } = useDimensions();

  const onSettingsChange = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveUserSettings(next);
      return next;
    });
  }, []);

  const handleSportConfigChange = useCallback((config: SportIdConfig) => {
    saveSportIdConfig(config);
    setSportConfig(config);
  }, []);

  const tabs: Array<{ id: AppPage; label: string; icon: typeof Zap }> = [
    { id: 'scraper', label: 'Cotes en direct', icon: Zap },
    { id: 'admin', label: 'Mes paris', icon: Database },
    { id: 'kpi', label: 'KPI', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="gradient-brand sticky top-0 z-40 text-white shadow-lg relative overflow-hidden">
        {/* Halo décoratif — pure CSS, pas d'image externe */}
        <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight tracking-tight">Paris Sportif - Value Bet</h1>
              <p className="text-[10px] text-white/70">
                Europe/Paris · Fabric App développée avec Rayfin — projet test de Microsoft Fabric (Preview)
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-1 rounded-xl bg-black/15 p-1 backdrop-blur-sm ring-1 ring-white/10">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  page === id
                    ? 'bg-white text-indigo-700 shadow-md scale-[1.02]'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-white/20" />
            <DataDictionaryButton />
          </nav>
        </div>
      </header>

      <main className="flex-1 px-3 py-3 max-w-[100vw] space-y-3">
        {page === 'scraper' && (
          <>
            <ScraperToolbar settings={settings} onSettingsChange={onSettingsChange} />
            <ScraperPage
              sportConfig={sportConfig}
              onSportConfigChange={handleSportConfigChange}
              sportIdsApi={dims?.sportIdsApi}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          </>
        )}
        {page === 'admin' && <AdminFactPage />}
        {page === 'kpi' && <KpiPage />}
      </main>
    </div>
  );
}

export default App;
