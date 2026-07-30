import { useSyncExternalStore } from 'react'
import { getLang, setLang, subscribe, t } from '../i18n'

// Re-rend le composant au changement de langue et expose t().
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang)
  return { t, lang, setLang }
}
