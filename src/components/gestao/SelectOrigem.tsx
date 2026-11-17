'use client'

// Origem / parceiro escolhido em lista em vez de digitado: os parceiros que recebem do escritório e as
// origens já em uso (origens.ts). "Outra origem…" abre o texto para cadastrar uma origem nova; parceiro
// novo não se digita aqui, entra pelo cadastro (Parâmetros) e passa a aparecer na lista. O que já estava
// gravado e não está na lista continua aparecendo como opção.
import { useId, useState } from 'react'
import { Field } from '@/components/ui/Input'
import { origemNaLista, type OpcoesOrigem } from '@/lib/gestao/origens'

const OUTRA = '__outra__'

export function SelectOrigem({ label, valor, onChange, opcoes, vazio = '—', hint, className }: {
  label: string
  valor: string
  onChange: (v: string) => void
  opcoes: OpcoesOrigem
  vazio?: string            // rótulo da opção sem valor ("Sem parceiro", "—")
  hint?: string
  className?: string
}) {
  const id = useId()
  const [digitando, setDigitando] = useState(false)
  const [anterior, setAnterior] = useState('')   // o que estava escolhido antes de "Outra origem…"
  const na = origemNaLista(valor, opcoes)

  if (digitando) {
    // voltar sem ter escrito nada devolve o que estava escolhido
    const voltar = () => { setDigitando(false); onChange(valor.trim() ? origemNaLista(valor, opcoes).valor : anterior) }
    return (
      <Field label={label} htmlFor={id} className={className} hint="Origem nova: ela passa a aparecer na lista depois de salvar.">
        <div className="flex items-center gap-2">
          <input id={id} className="w-full" value={valor} onChange={e => onChange(e.target.value)} placeholder="Nome da origem" autoFocus />
          <button type="button" className="link shrink-0 whitespace-nowrap text-label" onClick={voltar}>voltar à lista</button>
        </div>
      </Field>
    )
  }
  return (
    <Field label={label} htmlFor={id} className={className} hint={hint}>
      <select id={id} className="w-full" value={na.valor}
        onChange={e => { if (e.target.value === OUTRA) { setAnterior(valor); setDigitando(true); onChange('') } else onChange(e.target.value) }}>
        <option value="">{vazio}</option>
        {opcoes.parceiros.length > 0 && <optgroup label="Parceiros">{opcoes.parceiros.map(p => <option key={p} value={p}>{p}</option>)}</optgroup>}
        <optgroup label="Origens">
          {opcoes.origens.map(o => <option key={o} value={o}>{o}</option>)}
          {na.grupo === 'fora' && <option value={na.valor}>{na.valor}</option>}
          <option value={OUTRA}>Outra origem…</option>
        </optgroup>
      </select>
    </Field>
  )
}
