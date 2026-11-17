'use client'

// Motivo da perda escolhido em lista (origens.ts): os motivos que mais aparecem e "Outro", que abre o
// texto. Usado na ficha do lead e no "Marcar como perdido" da linha. O valor continua sendo o texto gravado.
import { useId, useState } from 'react'
import { Field } from '@/components/ui/Input'
import { MOTIVOS_PERDA, OUTRO_MOTIVO, motivoNaLista } from '@/lib/gestao/origens'

export function MotivoPerda({ valor, onChange, hint, autoFocus, className }: {
  valor: string
  onChange: (v: string) => void
  hint?: string
  autoFocus?: boolean
  className?: string
}) {
  const id = useId()
  const na = motivoNaLista(valor)
  // "Outro" fica escolhido mesmo com o texto ainda vazio
  const [outro, setOutro] = useState(na.escolha === OUTRO_MOTIVO)
  const escolha = outro ? OUTRO_MOTIVO : na.escolha
  return (
    <Field label="Motivo da perda" htmlFor={id} hint={hint} className={className}>
      <select id={id} className="w-full" value={escolha} autoFocus={autoFocus}
        onChange={e => { const v = e.target.value; if (v === OUTRO_MOTIVO) { setOutro(true); onChange('') } else { setOutro(false); onChange(v) } }}>
        <option value="">—</option>
        {MOTIVOS_PERDA.map(m => <option key={m} value={m}>{m}</option>)}
        <option value={OUTRO_MOTIVO}>Outro…</option>
      </select>
      {outro && <input className="w-full" value={valor} onChange={e => onChange(e.target.value)} placeholder="Escreva o motivo" aria-label="Outro motivo da perda" autoFocus />}
    </Field>
  )
}
