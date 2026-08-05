// Générateur des artefacts SQL depuis data/packs/*.json.
// Ce fichier ne contient QUE des I/O et du CLI : toute la logique — parsing,
// validation, génération SQL — vit dans src/lib/packs.ts, où elle est testée.
// Extension .ts obligatoire dans l'import : tsconfig.node.json est en nodenext.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fr } from '../src/i18n/fr.ts'
import { interpolate } from '../src/i18n/format.ts'
import {
  installSql, parseOfficialPackJson, seedSql, validateOfficialPacks,
  type OfficialPack, type PackError,
} from '../src/lib/packs.ts'

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const DOSSIER_PACKS = join(RACINE, 'data/packs')
const SEED = join(RACINE, 'supabase/seed.sql')
const MIGRATIONS = join(RACINE, 'supabase/migrations')

// Le dictionnaire français directement, pas le singleton i18n : ce CLI est un
// outil de dev français, et le singleton importerait src/i18n/index.ts, qui
// référence `document` — indésirable dans le projet TypeScript des scripts.
// Le numéro de carte n'est plus dans le message : c'est ici qu'on le compose,
// comme on compose déjà le nom du fichier.
const rendre = (e: PackError) =>
  (e.card === undefined ? '' : `carte ${e.card} : `) + interpolate(fr[e.key] ?? e.key, e.params)

function charger(): OfficialPack[] {
  const fichiers = readdirSync(DOSSIER_PACKS).filter(f => f.endsWith('.json')).sort()
  if (fichiers.length === 0) {
    console.error(`Aucun fichier de pack dans ${DOSSIER_PACKS}`)
    process.exit(1)
  }
  const packs: OfficialPack[] = []
  // le fichier est porté à côté de l'erreur, pas dedans : les messages sont
  // partagés avec l'éditeur, qui n'a pas de notion de fichier
  const errors: [fichier: string, erreur: PackError][] = []
  for (const f of fichiers) {
    const { pack, errors: errs } = parseOfficialPackJson(
      readFileSync(join(DOSSIER_PACKS, f), 'utf8'), basename(f, '.json'))
    for (const e of errs) errors.push([f, e])
    if (pack) packs.push(pack)
  }
  for (const e of validateOfficialPacks(packs)) errors.push(['data/packs', e])
  if (errors.length > 0) {
    console.error('Packs invalides :')
    for (const [f, e] of errors) console.error(`  - ${f} : ${rendre(e)}`)
    process.exit(1)
  }
  return packs
}

// Même format que `supabase migration new` : YYYYMMDDHHMMSS en UTC.
function horodatage(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14)
}

const [commande, nom] = process.argv.slice(2)
const packs = charger()

if (commande === 'seed') {
  writeFileSync(SEED, seedSql(packs))
  const total = packs.reduce((n, p) => n + p.cards.length, 0)
  console.log(`seed.sql régénéré : ${packs.length} pack(s), ${total} carte(s).`)
} else if (commande === 'migration') {
  if (!nom || !/^[a-z0-9_]+$/.test(nom)) {
    console.error('Usage : npm run cards:migration -- <nom_en_minuscules_et_underscores>')
    process.exit(1)
  }
  const chemin = join(MIGRATIONS, `${horodatage()}_${nom}.sql`)
  writeFileSync(chemin, `-- Généré par \`npm run cards:migration -- ${nom}\` depuis data/packs/*.json.\n-- install_official_pack remplace le jeu de cartes du pack : les anciennes\n-- cartes sont retirées, et supprimées si plus aucune partie ne les référence.\n\n${installSql(packs)}`)
  console.log(`Migration écrite : ${chemin}`)
} else {
  console.error('Usage : tsx scripts/build-cards.ts seed | migration <nom>')
  process.exit(1)
}
