import { useState } from 'react'
import { useT } from '../hooks/useT'
import type { FlatIssue, IssueTarget } from '../lib/packDraft'

// Le bandeau du bas : combien d'erreurs, et de quoi aller les corriger. Déplié,
// chaque entrée mène à l'endroit exact où la faute se répare — c'est ce qui le
// distingue d'un simple compteur.
export default function PackErrorSummary({ issues, onGo }: {
  issues: FlatIssue[]
  onGo: (target: IssueTarget) => void
}) {
  const { t } = useT()
  const [deplie, setDeplie] = useState(false)
  if (issues.length === 0) return null
  return (
    <>
      <div className="error-summary">
        <strong>
          {issues.length === 1 ? t('editor.errorsOne') : t('editor.errorsMany', { count: issues.length })}
        </strong>
        <span>{t('editor.errorsTitle')}</span>
        <button type="button" onClick={() => setDeplie(d => !d)}>
          {deplie ? t('editor.errorsHide') : t('editor.errorsSee')}
        </button>
      </div>
      {deplie && (
        <div className="error-list">
          {issues.map((f, i) => (
            <button key={i} type="button" onClick={() => onGo(f.target)}>
              {f.label ? `${f.label} — ` : ''}{t(f.error.key, f.error.params)}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
