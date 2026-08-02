import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/Card'
import PositionLegend from '../components/PositionLegend'
import { useProfile } from '../hooks/useProfile'
import { useT } from '../hooks/useT'
import { getPack, listPackCards, type PackCard, type PackRow } from '../lib/packsApi'
import { errorMessage } from '../lib/errors'

export default function PackPage() {
  const { slug } = useParams<'slug'>()
  const { profile } = useProfile()
  const { t } = useT()
  const [pack, setPack] = useState<PackRow | null>(null)
  const [cards, setCards] = useState<PackCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let alive = true
    setPack(null)
    setCards(null)
    setError(null)
    Promise.all([getPack(slug), listPackCards(slug)])
      .then(([p, c]) => { if (alive) { setPack(p); setCards(c) } })
      .catch(e => { if (alive) { setError(errorMessage(e)); setCards([]) } })
    return () => { alive = false }
  }, [slug])

  if (cards === null) return <p className="center">{t('common.loading')}</p>

  // Pack inconnu, supprimé, ou privé chez quelqu'un d'autre : la RLS ne renvoie
  // rien, et on ne distingue pas les trois cas — c'est le but.
  if (!pack) {
    return (
      <main className="page">
        <h1>{t('packs.notFound')}</h1>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  const positions = (pack.positions ?? {}) as Record<string, string>
  const aMoi = profile !== null && pack.owner_id === profile.id

  return (
    <main className="page">
      <div className="page-head">
        <h1>{pack.emoji && <span className="pack-emoji">{pack.emoji} </span>}{pack.name}</h1>
        {aMoi && (
          <Link className="btn-link" to={`/packs/${encodeURIComponent(pack.slug)}/editer`}>
            {t('packs.edit')}
          </Link>
        )}
      </div>
      {pack.description && <p className="hint">{pack.description}</p>}
      <PositionLegend positions={positions} />
      <p className="hint">{t('packs.cardCount', { count: cards.length })}</p>
      <div className="mini-cards">
        {cards.map(c => <Card key={c.id} card={c} size="mini" />)}
      </div>
      {error && <p className="error">{error}</p>}
      <Link className="home-link" to="/packs">{t('packs.title')}</Link>
    </main>
  )
}
