import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePacks } from '../hooks/usePacks'
import { useProfile } from '../hooks/useProfile'
import { useT } from '../hooks/useT'
import PackSection from '../components/PackSection'
import { deletePack, setPackVisibility, type PackSummary } from '../lib/packsApi'
import { errorMessage } from '../lib/errors'

export default function PacksPage() {
  const { packs, loading, error, reload } = usePacks()
  const { profile } = useProfile()
  const { t } = useT()
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading) return <p className="center">{t('common.loading')}</p>

  const officiels = packs.filter(p => p.owner_username === null)
  const communaute = packs.filter(p => p.owner_username !== null && !p.is_mine
                                       && p.visibility === 'public')
  const miens = packs.filter(p => p.is_mine)

  async function agir(action: () => Promise<void>) {
    setActionError(null)
    try {
      await action()
      reload()
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  const actionsDuPack = (p: PackSummary) => (
    <>
      <Link className="btn-ghost" to={`/packs/${encodeURIComponent(p.slug)}/editer`}>
        {t('packs.edit')}
      </Link>
      <button className="btn-ghost" onClick={() => agir(() =>
        setPackVisibility(p.slug, p.visibility === 'public' ? 'private' : 'public'))}>
        {p.visibility === 'public' ? t('packs.makePrivate') : t('packs.makePublic')}
      </button>
      <button className="btn-ghost danger" onClick={() => {
        if (confirm(t('packs.deleteConfirm', { name: p.name }))) agir(() => deletePack(p.slug))
      }}>
        {t('packs.delete')}
      </button>
    </>
  )

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t('packs.title')}</h1>
        {profile && <Link className="btn-link" to="/packs/nouveau">{t('packs.create')}</Link>}
      </div>
      <p className="hint">{t('packs.hint')}</p>
      {error && <p className="error">{error}</p>}
      {actionError && <p className="error">{actionError}</p>}

      <PackSection title={t('packs.sectionOfficial')} packs={officiels} />
      <PackSection title={t('packs.sectionCommunity')} packs={communaute}
                   empty={t('packs.emptyCommunity')} />
      {profile && (
        <PackSection title={t('packs.sectionMine')} packs={miens}
                     empty={t('packs.emptyMine')} actions={actionsDuPack} />
      )}
    </main>
  )
}
