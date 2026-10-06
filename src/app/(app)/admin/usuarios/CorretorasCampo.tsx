'use client'

// Caixas de seleção das corretoras que um usuário pode ver (profiles.corretoras).
import { CORRETORAS, CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'

export function CorretorasCampo({ valor, onChange }: { valor: Corretora[]; onChange: (v: Corretora[]) => void }) {
  return (
    <fieldset>
      <legend className="label">Corretoras que vê</legend>
      <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
        {CORRETORAS.map(c => (
          <label key={c} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-dense">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={valor.includes(c)}
              onChange={e => onChange(e.target.checked ? CORRETORAS.filter(x => x === c || valor.includes(x)) : valor.filter(x => x !== c))}
              aria-label={CORRETORA_LABEL[c]}
            />
            <CorretoraBadge corretora={c} />
          </label>
        ))}
      </div>
      <p className="mt-1 text-micro text-fg-subtle">Sem nenhuma marcada, o usuário não abre o controle de nenhuma corretora.</p>
    </fieldset>
  )
}
