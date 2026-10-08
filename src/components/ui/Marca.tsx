// Logotipo da Zeve: o "V" na cor da marca (--marca). A cor da marca entra só aqui, no ícone
// do app e no anel de foco; o resto da interface é monocromático (DESIGN.md §1).
// Redesenhado a partir da imagem do logotipo (traço arredondado); trocar pelo vetor original
// quando ele chegar. Proporção 4:3 — usar com h-6 w-8, h-7 w-9…
export function Marca({ className, cor = 'var(--marca)' }: { className?: string; cor?: string }) {
  return (
    <svg viewBox="0 0 320 240" className={className} aria-hidden focusable="false">
      <polyline points="30,100 118,212 294,24" fill="none" stroke={cor} strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
