// Partes comuns às abas da ficha do cliente (Resumo · Giro · Contas e tarifas · Cadastro)
import Link from 'next/link'
import { AlertTriangle, Check, Info } from 'lucide-react'
import type { clienteFicha } from '@/lib/gestao/consultas'
import type { LeadDoCliente } from '@/lib/gestao/consultasFicha'
import { Panel } from '@/components/ui/Panel'
import { StatusLeadBadge, TRACO, dataPt } from '@/components/gestao/Celulas'
import { cn } from '@/lib/utils'

export type Ficha = Awaited<ReturnType<typeof clienteFicha>>
export type Pendencia = { estado: 'ok' | 'info' | 'warn'; texto: string }

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const diaDaSemana = (iso: string) => DIAS[new Date(iso + 'T12:00:00').getDay()]

// O que está completo e o que falta no cadastro: os avisos (warn) são as pendências de verdade
export function pendenciasDaFicha({ resumo, cadastro, contas }: Ficha): Pendencia[] {
  if (!cadastro) return []
  const assessores = new Set(contas.map(c => c.assessor_nome ?? ''))
  // alertas da lista que já têm uma linha própria aqui
  const jaListados = new Set(['sem CPF/CNPJ', 'sem telefone', 'sem data de entrada', 'migrado sem data', 'fora do grupo de corretagem', 'grupo de corretagem bloqueado'])
  return [
    { estado: cadastro.documento ? 'ok' : 'warn', texto: cadastro.documento ? 'CPF/CNPJ cadastrado' : 'Sem CPF/CNPJ no cadastro' },
    { estado: cadastro.telefone ? 'ok' : 'warn', texto: cadastro.telefone ? 'Telefone cadastrado' : 'Sem telefone' },
    { estado: resumo?.status === 'Migrado' && !resumo.data_migracao ? 'warn' : 'ok', texto: resumo?.status === 'Migrado' && !resumo.data_migracao ? 'Migrado sem data de migração' : 'Datas consistentes' },
    { estado: resumo?.data_entrada ? 'ok' : 'info', texto: resumo?.data_entrada ? 'Data de entrada preenchida' : 'Sem data de entrada (campo manual)' },
    {
      estado: resumo?.grupo_corretagem === 'Vinculado' ? 'ok' : resumo?.grupo_corretagem ? 'warn' : 'info',
      texto: resumo?.grupo_corretagem === 'Vinculado' ? 'Vinculado ao grupo de corretagem'
        : resumo?.grupo_corretagem === 'Bloqueado' ? 'Grupo de corretagem bloqueado pelo banco: pedir o desbloqueio'
        : resumo?.grupo_corretagem === 'Não vinculado' ? 'Fora do grupo de corretagem' : 'Grupo de corretagem não informado (campo manual)',
    },
    ...(assessores.size > 1 ? [{ estado: 'info' as const, texto: `Contas com assessores diferentes: ${[...assessores].filter(Boolean).join(', ')}` }] : []),
    ...(contas.length > 1 ? [{ estado: 'info' as const, texto: `${contas.length} contas · a ficha usa a principal; lotes e receita somam todas` }] : []),
    ...(resumo?.alertas.filter(a => !/^\d+ contas$/.test(a) && !jaListados.has(a)).map(a => ({ estado: 'warn' as const, texto: a[0].toUpperCase() + a.slice(1) })) ?? []),
  ]
}

const ICONE = { ok: Check, info: Info, warn: AlertTriangle } as const
const COR = { ok: 'text-gain', info: 'text-fg-subtle', warn: 'text-warn' } as const

export function ListaPendencias({ itens }: { itens: Pendencia[] }) {
  return (
    <ul className="space-y-2 text-dense">
      {itens.map((a, i) => {
        const Icone = ICONE[a.estado]
        return (
          <li key={i} className="flex items-start gap-2">
            <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', COR[a.estado])} aria-hidden />
            <span className={a.estado === 'warn' ? 'text-fg' : 'text-fg-muted'}>{a.texto}</span>
          </li>
        )
      })}
    </ul>
  )
}

// De onde o cliente veio: o lead ligado a ele, o que respondeu no formulário e o que ficou anotado
export function LeadDeOrigem({ leads }: { leads: LeadDoCliente[] }) {
  return (
    <Panel variant="card" title="Lead de origem" subtitle="O que o cliente respondeu no formulário, quem atendeu e o que ficou anotado."
      action={<Link href="/leads" className="link text-dense">Leads</Link>}>
      <ul className="space-y-4">
        {leads.map(l => (
          <li key={l.id} className="text-dense">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{dataPt(l.data_hora.slice(0, 10))}</span>
              <StatusLeadBadge status={l.status} tipo="Fechado" />
            </div>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-fg-subtle">Origem</dt><dd>{l.origem ?? TRACO}</dd>
              <dt className="text-fg-subtle">Atendido por</dt><dd>{l.responsavel ?? TRACO}</dd>
              <dt className="text-fg-subtle">Já opera?</dt><dd>{l.ja_opera ?? TRACO}{l.corretora ? ` · ${l.corretora}` : ''}</dd>
            </dl>
            {l.observacoes && <p className="mt-1.5 whitespace-pre-wrap break-words text-fg-muted">{l.observacoes}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
