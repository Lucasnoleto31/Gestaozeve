'use client'

// Faixa "clientes por dia" (S47): os últimos dias com o +N de leads ganhos em cada um e quantos
// leads entraram. Hoje fica em destaque; no celular só os últimos 7 dias. Clicar no +N abre a lista
// de quem fechou naquele dia (nome, telefone e responsável), que a página já manda pronta.
import { useState } from 'react'
import { Panel } from '@/components/ui/Panel'
import { ModalGanhosDia } from '@/components/gestao/GanhosDia'
import { ganhosDoDia, rotuloDia, somaUltimos } from '@/lib/gestao/contatos'
import type { GanhoDia, LeadDiaRow } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function GanhosPorDia({ serie, hoje, ganhos = [] }: { serie: LeadDiaRow[]; hoje: string; ganhos?: GanhoDia[] }) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const ult7 = somaUltimos(serie, 7, 'ganhos')
  const ult14 = somaUltimos(serie, 14, 'ganhos')
  return (
    <Panel title="Clientes ganhos por dia" subtitle={`Leads fechados como Ganho em cada dia: ${fmtNum(ult7)} nos últimos 7 dias, ${fmtNum(ult14)} nos últimos 14. Embaixo, quantos leads entraram no dia. Clique no +N para ver quem fechou.`}>
      <ol className="grid grid-cols-7 gap-2 md:grid-cols-14" aria-label="Ganhos por dia">
        {serie.map((d, i) => {
          const rotulo = rotuloDia(d.dia, hoje)
          const conteudo = (
            <>
              <p className="truncate text-micro text-fg-muted"><span className="md:hidden">{rotulo.split(' ')[0]}</span><span className="hidden md:inline">{rotulo}</span></p>
              <p className={cn('mt-0.5 text-section font-bold tabular-nums', d.ganhos ? 'text-fg' : 'text-fg-subtle')}>{d.ganhos ? `+${fmtNum(d.ganhos)}` : '–'}</p>
              <p className="truncate text-micro tabular-nums text-fg-subtle">{d.entraram ? `${fmtNum(d.entraram)} ${d.entraram === 1 ? 'lead' : 'leads'}` : '\u00a0'}</p>
            </>
          )
          return (
            <li key={d.dia} className={cn('rounded-md text-center', d.dia === hoje ? 'bg-surface-2' : 'bg-surface', i < serie.length - 7 && 'hidden md:block')}
              title={`${ddmm(d.dia)}: ${fmtNum(d.ganhos)} ganhos · ${fmtNum(d.entraram)} leads entraram · ${fmtNum(d.contatos)} contatos · ${fmtNum(d.perdidos)} perdidos`}>
              {d.ganhos
                ? <button type="button" className="w-full rounded-md px-1 py-2 hover:bg-surface-3 md:px-2" onClick={() => setDiaAberto(d.dia)} aria-label={`Ver os ${fmtNum(d.ganhos)} ganhos de ${ddmm(d.dia)}`}>{conteudo}</button>
                : <div className="px-1 py-2 md:px-2">{conteudo}</div>}
            </li>
          )
        })}
      </ol>
      <ModalGanhosDia dia={diaAberto} ganhos={diaAberto ? ganhosDoDia(ganhos, diaAberto) : []} hoje={hoje} onClose={() => setDiaAberto(null)} />
    </Panel>
  )
}
