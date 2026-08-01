import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Card from '../components/Card'
import { useT } from '../hooks/useT'
import { listPackCards, type PackCard } from '../lib/packsApi'
import { errorMessage } from '../lib/errors'

export default function PackPage() {
  const { slug } = useParams<'slug'>()
  const { t } = useT()
  const [cards, setCards] = useState<PackCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let alive = true
    setCards(null)
    setError(null)
    listPackCards(slug)
      .then(c => { if (alive) setCards(c) })
      .catch(e => { if (alive) { setError(errorMessage(e)); setCards([]) } })
    return () => { alive = false }
  }, [slug])

  if (cards === null) return <p className="center">{t('common.loading')}</p>

  // Un slug inconnu ne renvoie pas d'erreur, juste zéro carte.
  if (!error && cards.length === 0) {
    return (
      <main className="page">
        <h1>{t('packs.notFound')}</h1>
      </main>
    )
  }

  return (
    <main className="page">
      <h1>{t(`packs.${slug}.name`)}</h1>
      <p className="hint">{t(`packs.${slug}.description`)}</p>
      <p className="hint">{t('packs.cardCount', { count: cards.length })}</p>
      <div className="mini-cards">
        {cards.map(c => <Card key={c.id} card={c} size="mini" />)}
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
