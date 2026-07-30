import { useT } from '../hooks/useT'

// Fixe en haut à droite, visible partout — y compris pendant une partie où le
// drawer (NavMenu) est verrouillé : c'est le seul moyen de changer de langue
// en cours de jeu.
export default function LangSwitch() {
  const { t, lang, setLang } = useT()
  return (
    <div className="lang-switch" role="group" aria-label={t('nav.language')}>
      {(['fr', 'en'] as const).map(l => (
        <button key={l} className={`linklike${lang === l ? ' active' : ''}`}
          aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
