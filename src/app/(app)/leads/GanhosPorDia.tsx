// Faixa "clientes por dia" (S47): os últimos dias com o +N de leads ganhos em cada um e quantos
// leads entraram. Hoje fica em destaque; no celular só os últimos 7 dias. Sem hooks: Server Component.
import { Panel } from '@/components/ui/Panel'
import { rotuloDia, somaUltimos } from '@/lib/gestao/contatos'
import type { LeadDiaRow } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function GanhosPorDia({ serie, hoje }: { serie: LeadDiaRow[]; hoje: string }) {
  const ult7 = somaUltimos(serie, 7, 'ganhos')
  const ult14 = somaUltimos(serie, 14, 'ganhos')
  return (
    <Panel title="Clientes ganhos por dia" subtitle={`Leads fechados como Ganho em cada dia: ${fmtNum(ult7)} nos últimos 7 dias, ${fmtNum(ult14)} nos últimos 14. Embaixo, quantos leads entraram no dia.`}>
      <ol className="grid grid-cols-7 gap-2 md:grid-cols-14" aria-label="Ganhos por dia">
        {serie.map((d, i) => {
          const rotulo = rotuloDia(d.dia, hoje)
          return (
            <li key={d.dia} className={cn('rounded-md px-1 py-2 text-center md:px-2', d.dia === hoje ? 'bg-surface-2' : 'bg-surface', i < serie.length - 7 && 'hidden md:block')}
              title={`${ddmm(d.dia)}: ${fmtNum(d.ganhos)} ganhos · ${fmtNum(d.entraram)} leads entraram · ${fmtNum(d.contatos)} contatos · ${fmtNum(d.perdidos)} perdidos`}>
              <p className="truncate text-micro text-fg-muted"><span className="md:hidden">{rotulo.split(' ')[0]}</span><span className="hidden md:inline">{rotulo}</span></p>
              <p className={cn('mt-0.5 text-section font-bold tabular-nums', d.ganhos ? 'text-fg' : 'text-fg-subtle')}>{d.ganhos ? `+${fmtNum(d.ganhos)}` : '–'}</p>
              <p className="truncate text-micro tabular-nums text-fg-subtle">{d.entraram ? `${fmtNum(d.entraram)} ${d.entraram === 1 ? 'lead' : 'leads'}` : '\u00a0'}</p>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
