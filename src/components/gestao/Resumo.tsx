import type { ReactNode } from 'react'

// Espaço que não quebra entre o número e a unidade ("27 %", "R$ 142 mil"), para a frase não partir no meio
export const semQuebra = (s: string) => s.replace(/(\d) (%|mil\b|milh)/g, '$1 $2').replace(/R\$ /g, 'R$ ')

// A resposta da tela em uma frase, antes de qualquer cartão ou tabela (o mesmo jeito do Início).
// `apoio` = a segunda linha, mais discreta; `nota` = letra miúda (até que dia os lotes estão lançados).
export function Resumo({ frase, apoio, nota }: { frase: string; apoio?: string | null; nota?: ReactNode }) {
  return (
    <div className="max-w-5xl">
      <p className="text-balance text-section font-medium text-fg">{semQuebra(frase)}</p>
      {apoio && <p className="mt-1.5 text-dense text-fg-muted">{semQuebra(apoio)}</p>}
      {nota && <p className="mt-1 text-label text-fg-subtle">{nota}</p>}
    </div>
  )
}
