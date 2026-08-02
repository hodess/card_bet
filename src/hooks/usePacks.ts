import { useCallback, useEffect, useState } from 'react'
import { listPacks, type PackSummary } from '../lib/packsApi'
import { errorMessage } from '../lib/errors'

// Les packs ne bougent qu'à la demande de l'utilisateur (création, bascule de
// visibilité, suppression) : pas d'abonnement realtime, un reload explicite.
// Un échec de chargement est remonté à l'appelant via le champ error,
// à charge pour lui de l'afficher ; c'est l'appelant qui décide de l'UX.
export function usePacks(): {
  packs: PackSummary[]; loading: boolean; error: string | null; reload: () => void
} {
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    listPacks()
      .then(p => { if (alive) setPacks(p) })
      .catch(e => { if (alive) setError(errorMessage(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tick])

  const reload = useCallback(() => setTick(n => n + 1), [])
  return { packs, loading, error, reload }
}
