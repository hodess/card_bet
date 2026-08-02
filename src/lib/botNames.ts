import config from '../config.json'

// Le tempérament est ce qui empêche deux bots de même niveau d'être des clones :
// à table égale ils calculeraient le même plafond au centime près. Il est dérivé
// du PSEUDO et non tiré au hasard, pour que « Bot Zizou » soit toujours le
// flambeur — un adversaire reconnaissable est un adversaire dont on apprend.
export type Temperament = {
  kappa: number       // multiplicateur de l'agressivité du niveau
  gamma: number       // multiplicateur de la courbure du niveau
  restraint: number   // retenue ABSOLUE : proche de 1 = mise presque sa valeur
  jumpRate: number    // multiplicateur du jumpRate du niveau
  delayFactor: number // multiplicateur du délai de réaction : < 1 = plus rapide
}

const TEMPERAMENTS = config.bot.temperaments as Record<string, Temperament>
const DEFAUT = config.bot.names[0]

// Un nom distinct par bot : les noms du config d'abord, puis suffixés. Sans ça,
// deux « Bot Pep » à la même table sont indiscernables.
export function pickBotName(taken: string[]): string {
  const libre = config.bot.names.find(n => !taken.includes(n))
  if (libre) return libre
  for (let n = 2; ; n++) {
    const candidat = config.bot.names.map(base => `${base} ${n}`).find(c => !taken.includes(c))
    if (candidat) return candidat
  }
}

// « Bot Zizou » → copie 1, « Bot Zizou 2 » → copie 2. Un pseudo inconnu retombe
// sur le premier tempérament plutôt que de planter.
function splitName(nickname: string): { base: string; copie: number } {
  const base = config.bot.names.find(n => nickname === n || nickname.startsWith(`${n} `))
  if (!base) return { base: DEFAUT, copie: 1 }
  const suffixe = nickname.slice(base.length).trim()
  const copie = suffixe === '' ? 1 : Number(suffixe)
  return { base, copie: Number.isFinite(copie) && copie >= 1 ? copie : 1 }
}

export function temperamentOf(nickname: string): Temperament {
  const { base, copie } = splitName(nickname)
  const t = TEMPERAMENTS[base] ?? TEMPERAMENTS[DEFAUT]
  const n = copie - 1
  return {
    ...t,
    kappa: t.kappa + n * config.bot.suffixShift.kappa,
    restraint: Math.min(0.95, t.restraint + n * config.bot.suffixShift.restraint),
  }
}
