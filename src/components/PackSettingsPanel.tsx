import config from '../config.json'
import SheetPanel from './SheetPanel'
import { useT } from '../hooks/useT'
import type { PackIssues } from '../lib/packDraft'

const L = config.packs

// L'identité du pack, sa visibilité, et l'échange de fichiers JSON — tout ce qui
// n'est pas une carte. Les deux boutons de fichier délèguent à la page : un
// composant ne touche ni au disque ni au réseau.
export default function PackSettingsPanel({
  name, emoji, description, visibility, issues, cardCount,
  onField, onVisibility, onImport, onExport, onClose,
}: {
  name: string
  emoji: string
  description: string
  visibility: 'public' | 'private'
  issues: PackIssues
  cardCount: number
  onField: (champ: 'name' | 'emoji' | 'description', valeur: string) => void
  onVisibility: (v: 'public' | 'private') => void
  onImport: () => void
  onExport: () => void
  onClose: () => void
}) {
  const { t } = useT()

  return (
    <SheetPanel
      title={t('editor.settingsTitle')}
      left={{ label: t('editor.close'), onClick: onClose }}
      right={{ label: t('editor.done'), onClick: onClose }}
      onClose={onClose}
    >
      <div className="field">
        <label htmlFor="pack-emoji">{t('editor.settingsEmoji')}</label>
        <input id="pack-emoji" value={emoji} onChange={e => onField('emoji', e.target.value)} />
        {issues.emoji && <p className="error">{t(issues.emoji.key, issues.emoji.params)}</p>}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="pack-nom">{t('editor.settingsName')}</label>
          <span className="field-hint">
            {t('editor.counter', { n: [...name].length, max: L.nameMaxLength })}
          </span>
        </div>
        <input id="pack-nom" value={name} onChange={e => onField('name', e.target.value)} />
        {issues.name && <p className="error">{t(issues.name.key, issues.name.params)}</p>}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="pack-desc">{t('editor.settingsDescription')}</label>
          <span className="field-hint">
            {t('editor.counter', { n: [...description].length, max: L.descriptionMaxLength })}
          </span>
        </div>
        <textarea id="pack-desc" value={description}
                  onChange={e => onField('description', e.target.value)} />
        {issues.description && (
          <p className="error">{t(issues.description.key, issues.description.params)}</p>
        )}
      </div>

      <div className="field">
        <span className="field-name">{t('editor.visibility')}</span>
        <div className="segmented">
          <button type="button" className={visibility === 'private' ? 'on' : ''}
                  onClick={() => onVisibility('private')}>{t('packs.private')}</button>
          <button type="button" className={visibility === 'public' ? 'on' : ''}
                  onClick={() => onVisibility('public')}>{t('packs.public')}</button>
        </div>
        <span className="field-hint">{t('editor.settingsPublicHint')}</span>
      </div>

      <div className="field">
        <span className="field-name">{t('editor.jsonTitle')}</span>
        <span className="field-hint">{t('editor.jsonHelp')}</span>
        <div className="pack-actions">
          <button type="button" className="btn-ghost" onClick={onImport}>{t('editor.import')}</button>
          <button type="button" className="btn-ghost" onClick={onExport}>{t('editor.export')}</button>
        </div>
        <span className="field-hint">{t('editor.importWarning', { count: cardCount })}</span>
      </div>
    </SheetPanel>
  )
}
