// i18n maison : singleton utilisable hors React (errorMessage en dépend),
// donc AUCUN import React ici. Le hook vit dans src/hooks/useT.ts.
import { fr } from './fr'
import { en } from './en'

export { fr, en }
export type Lang = 'fr' | 'en'

const DICTS: Record<Lang, Record<string, string>> = { fr, en }
const STORAGE_KEY = 'cardbet-lang'

function isLang(v: string | null): v is Lang {
  return v === 'fr' || v === 'en'
}

// localStorage peut lever (navigation privée, stockage bloqué) : jamais bloquant.
function stored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}

function fromNavigator(): Lang {
  const nav = typeof navigator === 'undefined' ? '' : navigator.language ?? ''
  return nav.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

// Pas du React (juste du DOM) : autorisé dans ce module. Défensif pour ne pas
// casser un environnement de test en `node` (pas de `document`).
function syncDocumentLang(l: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = l
}

let lang: Lang = stored() ?? fromNavigator()
syncDocumentLang(lang)
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return lang
}

export function setLang(next: Lang): void {
  if (next === lang) return
  lang = next
  syncDocumentLang(lang)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // pas de persistance possible : la langue reste valable pour la session
  }
  listeners.forEach(cb => cb())
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

// Clé absente → on renvoie la clé (visible en dev, jamais un crash).
// Variable absente → le motif {var} reste en place.
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang][key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (motif, name: string) =>
    name in vars ? String(vars[name]) : motif)
}

// Locale de formatage des dates/nombres, accordée à la langue.
export function locale(): string {
  return lang === 'fr' ? 'fr-FR' : 'en-GB'
}
