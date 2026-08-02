// Interpolation pure des motifs {var} : ni singleton, ni DOM. C'est ce qui la
// rend utilisable depuis un script Node comme depuis le navigateur.
export function interpolate(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (motif, name: string) =>
    name in vars ? String(vars[name]) : motif)
}
