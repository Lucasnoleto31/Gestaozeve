'use client'

// A grade do calendário (Funil › Calendário): cada dia com quantos leads foram ganhos, quantos foram
// perdidos e quantos clientes pararam de girar. Clicar no dia abre a lista dos três. A página manda tudo
// pronto; aqui não há leitura.
import Link from 'next/link'
import { useState } from 'react'
import { Pause, Trophy, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { TRACO, dataCurta, n0 } from '@/components/gestao/Celulas'
import { rotuloDia } from '@/lib/gestao/contatos'
import { semanasDoMes, type DiaDoCalendario, type FechadoDia, type ParouDia } from '@/lib/gestao/calendario'
import { CORRETORA_SLUG } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
// "17/11/26 · hoje", "16/11/26 · ontem" ou "sex 13/11" (o rótulo do dia já traz a data)
const tituloDoDia = (dia: string, hoje: string) => { const r = rotuloDia(dia, hoje); return r === 'hoje' || r === 'ontem' ? `${dataCurta(dia)} · ${r}` : r }

// Uma das três contagens do dia: ícone e número na cor do que conta; a palavra só aparece em tela larga
function Conta({ n, icone: Icone, cor, palavra }: { n: number; icone: typeof Trophy; cor: string; palavra: string }) {
  if (!n) return null
  return (
    <span className={cn('flex items-center gap-1 text-label font-semibold tabular-nums', cor)}>
      <Icone className="h-3 w-3 shrink-0" aria-hidden />{fmtNum(n)}
      <span className="hidden truncate font-normal text-fg-muted lg:inline">{palavra}</span>
    </span>
  )
}

export function CalendarioDoMes({ mes, hoje, dias, ganhos, perdidos, parados }: {
  mes: string
  hoje: string
  dias: DiaDoCalendario[]
  ganhos: FechadoDia[]
  perdidos: FechadoDia[]
  parados: ParouDia[]
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const porDia = new Map(dias.map(d => [d.dia, d]))
  const doDia = <T extends { dia: string }>(itens: T[]) => itens.filter(i => i.dia === aberto)
  // quem parou aparece do que mais gira para o que menos gira: é a ordem de quem chamar primeiro
  const g = aberto ? doDia(ganhos) : [], p = aberto ? doDia(perdidos) : [], s = aberto ? doDia(parados).sort((a, b) => b.lotes_12m - a.lotes_12m) : []

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-label text-fg-muted" aria-hidden>
        <span className="inline-flex items-center gap-1"><Trophy className="h-3 w-3 text-gain" />ganhos</span>
        <span className="inline-flex items-center gap-1"><XCircle className="h-3 w-3 text-loss" />perdidos</span>
        <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3 text-warn" />pararam de girar</span>
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendário do mês">
        {SEMANA.map(d => <div key={d} role="columnheader" className="pb-1 text-center text-micro text-fg-subtle">{d}</div>)}
        {semanasDoMes(mes).flat().map((dia, i) => {
          if (!dia) return <div key={`v${i}`} role="gridcell" />
          const d = porDia.get(dia)
          const total = d ? d.ganhos + d.perdidos + d.pararam : 0
          const futuro = dia > hoje
          const base = cn('flex min-h-[76px] min-w-0 flex-col gap-0.5 rounded-md border p-1.5 text-left', dia === hoje ? 'border-fg' : 'border-line', futuro && 'opacity-50')
          const conteudo = (
            <>
              <span className={cn('text-micro tabular-nums', dia === hoje ? 'font-semibold text-fg' : 'text-fg-muted')}>{Number(dia.slice(8, 10))}</span>
              {d && <>
                <Conta n={d.ganhos} icone={Trophy} cor="text-gain" palavra={d.ganhos === 1 ? 'ganho' : 'ganhos'} />
                <Conta n={d.perdidos} icone={XCircle} cor="text-loss" palavra={d.perdidos === 1 ? 'perdido' : 'perdidos'} />
                <Conta n={d.pararam} icone={Pause} cor="text-warn" palavra={d.pararam === 1 ? 'parou' : 'pararam'} />
              </>}
            </>
          )
          return total > 0 && d
            ? (
              <button key={dia} type="button" role="gridcell" onClick={() => setAberto(dia)} className={cn(base, 'cursor-pointer hover:bg-surface-2')}
                aria-label={`${dataCurta(dia)}: ${plural(d.ganhos, 'ganho', 'ganhos')}, ${plural(d.perdidos, 'perdido', 'perdidos')}, ${plural(d.pararam, 'cliente parou de girar', 'clientes pararam de girar')}. Ver a lista`}>
                {conteudo}
              </button>
            )
            : <div key={dia} role="gridcell" className={base}>{conteudo}</div>
        })}
      </div>

      <Modal open={!!aberto} onClose={() => setAberto(null)} size="xl" title={aberto ? tituloDoDia(aberto, hoje) : ''}
        subtitle={aberto ? [plural(g.length, 'lead ganho', 'leads ganhos'), plural(p.length, 'perdido', 'perdidos'), plural(s.length, 'cliente parou de girar', 'clientes pararam de girar')].join(' · ') : ''}>
        <div className="space-y-6">
          {g.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-dense font-semibold"><Trophy className="h-3.5 w-3.5 text-gain" aria-hidden />Ganhos · {fmtNum(g.length)}</h3>
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Nome</th><th>Telefone</th><th>Responsável</th></tr></thead>
                  <tbody>{g.map(x => <tr key={x.id}><td className="max-w-[240px] truncate font-medium">{x.nome}</td><td className="num whitespace-nowrap">{x.whatsapp ?? TRACO}</td><td className="muted">{x.responsavel ?? TRACO}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          {p.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-dense font-semibold"><XCircle className="h-3.5 w-3.5 text-loss" aria-hidden />Perdidos · {fmtNum(p.length)}</h3>
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Nome</th><th>Motivo</th><th className="col-p2">Responsável</th></tr></thead>
                  <tbody>{p.map(x => <tr key={x.id}><td className="max-w-[240px] truncate font-medium">{x.nome}</td><td className="max-w-[260px] truncate muted">{x.motivo ?? TRACO}</td><td className="muted col-p2">{x.responsavel ?? TRACO}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          {s.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-dense font-semibold"><Pause className="h-3.5 w-3.5 text-warn" aria-hidden />Pararam de girar · {fmtNum(s.length)}</h3>
              <p className="mb-2 text-label text-fg-muted">Operaram pela última vez neste dia e não voltaram.</p>
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Cliente</th><th>Corretora</th><th className="col-p2">Responsável</th><th className="num">Sem operar há</th><th className="num col-p2">Lotes em 12 meses</th></tr></thead>
                  <tbody>
                    {s.map(x => (
                      <tr key={`${x.corretora}:${x.cliente_id}`}>
                        <td className="max-w-[240px] truncate font-medium"><Link href={`/${CORRETORA_SLUG[x.corretora]}/clientes/${x.cliente_id}`} className="link">{x.nome}</Link></td>
                        <td><CorretoraBadge corretora={x.corretora} /></td>
                        <td className="muted col-p2">{x.responsavel ?? TRACO}</td>
                        <td className="num whitespace-nowrap">{plural(x.pregoes, 'pregão', 'pregões')}</td>
                        <td className="num col-p2">{n0(x.lotes_12m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </Modal>
    </>
  )
}
