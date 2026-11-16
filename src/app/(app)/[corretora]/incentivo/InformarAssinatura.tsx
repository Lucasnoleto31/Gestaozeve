'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { salvarParametro } from '@/lib/gestao/acoes'
import type { Corretora } from '@/lib/corretoras'

// Botão do aviso "data de assinatura não informada": abre o campo de data ali mesmo e grava o mesmo
// parâmetro da tela Parâmetros (atp_assinatura). Só o administrador vê; a ação também confere.
export function InformarAssinatura({ corretora }: { corretora: Corretora }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  const salvar = () => iniciar(async () => {
    setErro(null)
    const [ano, mes, dia] = data.split('-')
    const r = await salvarParametro(corretora, 'atp_assinatura', `${dia}/${mes}/${ano}`)
    if (!r.ok) { setErro(r.erro); return }
    setAberto(false)
    router.refresh()
  })

  if (!aberto) return <Button variant="secondary" size="xs" onClick={() => setAberto(true)}>Informar a data</Button>
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); if (data) salvar() }}>
      <label className="flex items-center gap-2 text-label text-fg-muted">
        Assinatura do termo
        <input type="date" className="field-sm" value={data} onChange={e => setData(e.target.value)} autoFocus required aria-label="Data de assinatura do termo" />
      </label>
      <Button type="submit" size="xs" loading={salvando} disabled={!data}>Salvar</Button>
      <Button variant="ghost" size="xs" onClick={() => { setAberto(false); setErro(null) }} disabled={salvando}>Cancelar</Button>
      {erro && <span className="basis-full text-label text-loss" role="alert">{erro}</span>}
    </form>
  )
}
