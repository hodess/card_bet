import { Link } from 'react-router-dom'
import { usePacks } from '../hooks/usePacks'
import { useT } from '../hooks/useT'
import PackTile from '../components/PackTile'

export default function PacksPage() {
  const { packs, loading, error } = usePacks()
  const { t } = useT()

  if (loading) return <p className="center">{t('common.loading')}</p>

  return (
    <main className="page">
      <h1>{t('packs.title')}</h1>
      <p className="hint">{t('packs.hint')}</p>
      {error && <p className="error">{error}</p>}
      <div className="pack-grid">
        {packs.map(p => (
          <Link key={p.slug} className="pack-link" to={`/packs/${p.slug}`}>
            <PackTile pack={p} />
          </Link>
        ))}
      </div>
    </main>
  )
}
