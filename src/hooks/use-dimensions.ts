import { useCallback, useEffect, useState } from 'react';
import {
  type DimensionCatalog,
  getDimensions,
  invalidateDimensionsCache,
  loadDimensions,
} from '@/lib/dimensions';

export function useDimensions() {
  const [dims, setDims] = useState<DimensionCatalog | null>(() => {
    try {
      return getDimensions();
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!dims);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    invalidateDimensionsCache();
    try {
      const catalog = await loadDimensions();
      setDims(catalog);
      setError(null);
    } catch (e) {
      setDims(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dims) return;
    void reload();
  }, [dims, reload]);

  // Garde-fou si le réseau / l'embed ne répond jamais.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false);
      setError((prev) =>
        prev ?? 'Chargement des référentiels trop long — vérifiez la connexion Fabric puis réessayez.',
      );
    }, 35_000);
    return () => clearTimeout(timer);
  }, [loading]);

  return { dims, loading, error, reload };
}
