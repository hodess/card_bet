import { useEffect, useState } from 'react'
import { listPacks, type PackSummary } from '../lib/packsApi'
import { errorMessage } from '../lib/errors'

// Les packs sont statiques : un seul chargement, aucun abonnement realtime.
// Un échec de chargement est remonté à l'appelant via le champ error,
// à charge pour lui de l'afficher ; c'est l'appelant qui décide de l'UX.
export function usePacks(): { packs: PackSummary[]; loading: boolean; error: string | null } {
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listPacks()
      .then(p => { if (alive) setPacks(p) })
      .catch(e => { if (alive) setError(errorMessage(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { packs, loading, error }
}
