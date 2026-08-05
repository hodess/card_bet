import { useCallback, useMemo, useState } from 'react'
import {
  addPosition, draftFromJson, emptyDraft, flattenIssues, removeCard, removePosition,
  renamePosition, saveCard, setPositionLabel, toPackInput, validateDraft,
  type DraftCard, type PackDraft,
} from '../lib/packDraft'
import type { PackError } from '../lib/packs'

// Porte l'état du brouillon, et rien d'autre : aucune règle ici, tout vient de
// packDraft.ts. C'est le même partage que useAuctionPhase / auctionPhase — la
// logique dans un module pur testable, l'état React dans un hook mince.
export function usePackDraft() {
  const [draft, setDraft] = useState<PackDraft>(emptyDraft)
  const [modifie, setModifie] = useState(false)

  const issues = useMemo(() => validateDraft(draft), [draft])
  const plates = useMemo(() => flattenIssues(draft, issues), [draft, issues])

  // Charger, c'est recevoir la version du serveur : le brouillon n'est pas
  // « modifié » pour autant, sinon le garde-fou de sortie se déclencherait sans
  // qu'on ait touché à quoi que ce soit.
  const charger = useCallback((d: PackDraft) => { setDraft(d); setModifie(false) }, [])
  // Remplacer, c'est un import ou l'exemple : ça compte comme une modification.
  const remplacer = useCallback((d: PackDraft) => { setDraft(d); setModifie(true) }, [])

  const muter = useCallback((f: (d: PackDraft) => PackDraft) => {
    setModifie(true)
    setDraft(f)
  }, [])

  const setChamp = useCallback((champ: 'name' | 'emoji' | 'description', valeur: string) => {
    muter(d => ({ ...d, [champ]: valeur }))
  }, [muter])

  const enregistrerCarte = useCallback((card: DraftCard) => {
    muter(d => saveCard(d, card))
  }, [muter])

  const supprimerCarte = useCallback((id: string) => {
    muter(d => removeCard(d, id))
  }, [muter])

  const ajouterPosition = useCallback(() => muter(addPosition), [muter])

  const renommerPosition = useCallback((id: string, code: string) => {
    muter(d => renamePosition(d, id, code))
  }, [muter])

  const changerLibelle = useCallback((id: string, label: string) => {
    muter(d => setPositionLabel(d, id, label))
  }, [muter])

  // Rend le refus éventuel plutôt que de l'avaler : le panneau l'affiche.
  const supprimerPosition = useCallback((id: string): PackError | null => {
    const { draft: apres, error } = removePosition(draft, id)
    if (!error) { setDraft(apres); setModifie(true) }
    return error
  }, [draft])

  // Import tolérant : le brouillon prend tout ce qui est lisible, les erreurs
  // rendues ici sont celles qui ont fait refuser le fichier en bloc, ou les
  // champs inconnus rencontrés au passage.
  const importer = useCallback((text: string): PackError[] => {
    const { draft: d, errors } = draftFromJson(text)
    if (d) { setDraft(d); setModifie(true) }
    return errors
  }, [])

  return {
    draft, issues, plates, modifie,
    charger, remplacer, setChamp,
    enregistrerCarte, supprimerCarte,
    ajouterPosition, renommerPosition, changerLibelle, supprimerPosition,
    importer,
    payload: () => toPackInput(draft),
  }
}
