'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { useToast } from '@/components/ui/Toast'
import { LinhaVazia, TRACO, n2, r0, rCurto } from '@/components/gestao/Celulas'
import { salvarCorretagensDia } from '@/lib/gestao/acoes'
import { numeroBR } from '@/lib/gestao/planilhas'
import { somarDias } from '@/lib/gestao/meses'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Corretora } from '@/lib/corretoras'
import type { OperacaoDia } from '@/lib/gestao/tipos'

const TIPO: Record<OperacaoDia['tipo'], { label: string; variant: BadgeVariant; unidade: string }> = {
  lote: { label: 'Lotes', variant: 'accent', unidade: '/lote' },
  acoes: { label: 'Ações', variant: 'warn', unidade: '/op.' },
  posicao: { label: 'Posição', variant: 'neutral', unidade: '/op.' },
  zeragem: { label: 'Zeragem', variant: 'loss', unidade: '/contr.' },
}

const EPS = 1e-9
const fmtEntrada = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false })
const igual = (a: number, b: number) => Math.abs(a - b) < EPS

// Navegação entre dias (cabeçalho da página)
export function DiaPicker({ base, dia }: { base: string; dia: string }) {
  const router = useRouter()
  const ir = (d: string) => { if (d) router.push(`${base}/lotes/${d}`) }
  return (
    <div className="flex items-center gap-1">
      <IconButton aria-label="Dia anterior" onClick={() => ir(somarDias(dia, -1))}><ChevronLeft className="h-4 w-4" aria-hidden /></IconButton>
      <input type="date" value={dia} onChange={e => ir(e.target.value)} className="h-9 w-[9.5rem]" aria-label="Dia" />
      <IconButton aria-label="Dia seguinte" onClick={() => ir(somarDias(dia, 1))}><ChevronRight className="h-4 w-4" aria-hidden /></IconButton>
    </div>
  )
}

export function OperacoesDia({ corretora, dia, linhas, admin }: {
  corretora: Corretora
  dia: string
  linhas: OperacaoDia[]
  admin: boolean
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(linhas.map(o => [o.id, fmtEntrada(o.tarifa)])))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const editavel = (o: OperacaoDia) => admin && o.tipo !== 'zeragem' && o.conta_para_receita
  const valorDe = (o: OperacaoDia) => {
    if (!editavel(o)) return o.tarifa
    const v = numeroBR(valores[o.id] ?? '')
    return Number.isFinite(v) && v >= 0 ? v : 0
  }
  const receitaDe = (o: OperacaoDia) => {
    if (!o.conta_para_receita) return 0
    if (o.tipo === 'zeragem') return o.qtd * o.zeragem_rs
    if (o.tipo === 'lote') return o.qtd * valorDe(o)
    return valorDe(o)
  }

  const alteradas = linhas.filter(o => editavel(o) && !igual(valorDe(o), o.tarifa))
  const contam = linhas.filter(o => o.conta_para_receita)
  const lotes = contam.filter(o => o.tipo === 'lote').reduce((s, o) => s + o.qtd, 0)
  const zerados = contam.filter(o => o.tipo === 'zeragem').reduce((s, o) => s + o.qtd, 0)
  const opAcoes = contam.filter(o => o.tipo === 'acoes').length
  const posicao = contam.filter(o => o.tipo === 'posicao').reduce((s, o) => s + o.qtd, 0)
  const receita = linhas.reduce((s, o) => s + receitaDe(o), 0)
  const clientes = new Set(contam.filter(o => o.tipo === 'lote' || o.tipo === 'acoes').map(o => o.cliente_id ?? o.cliente_nome)).size
  const manuais = linhas.filter(o => o.tarifa_manual != null).length

  const restaurar = (o: OperacaoDia) => setValores(v => ({ ...v, [o.id]: fmtEntrada(o.tarifa_padrao) }))
  const desfazer = () => { setValores(Object.fromEntries(linhas.map(o => [o.id, fmtEntrada(o.tarifa)]))); setErro(null) }

  const salvar = async () => {
    setSalvando(true); setErro(null)
    const itens = alteradas.map(o => {
      const v = valorDe(o)
      return { id: o.id, tarifa: igual(v, o.tarifa_padrao) ? null : v }
    })
    const r = await salvarCorretagensDia(corretora, dia, itens)
    setSalvando(false)
    if (!r.ok) { setErro(r.erro); return }
    avisar({ titulo: 'Corretagens salvas', detalhe: `${fmtNum(r.dados.alteradas)} operação(ões) ajustada(s) · lotes e receita recalculados.`, tom: 'gain' })
    router.refresh()
  }

  return (
    <>
      <KpiRow cols={5}>
        <KpiCard label="Lotes no dia" value={fmtNum(lotes)} sub={`${fmtNum(zerados)} zerados${posicao ? ` · ${fmtNum(posicao)} em posição` : ''}`} />
        <KpiCard label="Operações" value={fmtNum(contam.length)} sub={opAcoes ? `${fmtNum(opAcoes)} em ações e cripto` : `${fmtNum(linhas.length - contam.length) || 'nenhuma'} fora da receita`} />
        <KpiCard label="Clientes operando" value={fmtNum(clientes)} sub="com lotes ou ações no dia" />
        <KpiCard destaque label="Receita do dia" value={rCurto(receita)} sub={alteradas.length ? 'com as alterações ainda não salvas' : lotes ? `${n2(Math.round((receita / lotes) * 1000) / 1000)} R$/lote` : undefined} tone={alteradas.length ? 'warn' : 'neutral'} />
        <KpiCard label="Corretagens manuais" value={fmtNum(manuais)} sub={manuais ? 'diferentes do cadastro' : 'tudo pelo cadastro'} />
      </KpiRow>

      <Panel
        title="Operações do dia"
        subtitle="Lotes = day trade em futuros (R$ por lote) · Ações = day trade em ações e cripto (R$ por operação) · Posição = carregada, só rende se tiver corretagem informada · Zeragem = R$ por contrato zerado."
        action={admin && alteradas.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={desfazer} disabled={salvando}>Desfazer</Button>
            <Button size="sm" onClick={salvar} loading={salvando}>Salvar {alteradas.length} {alteradas.length === 1 ? 'alteração' : 'alterações'}</Button>
          </div>
        ) : undefined}
      >
        {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
        <div className="tbl-wrap max-h-[70vh]">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Cliente</th><th>Ativo</th><th>Tipo</th><th className="num">Qtd.</th><th className="num">Corretagem</th><th className="num">Receita</th><th className="col-p3">Modo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <LinhaVazia colunas={7}>Nenhuma operação lançada nesse dia.</LinhaVazia>}
              {linhas.map(o => {
                const t = TIPO[o.tipo]
                const pode = editavel(o)
                const mudou = pode && !igual(valorDe(o), o.tarifa)
                const foraDoPadrao = pode && !igual(valorDe(o), o.tarifa_padrao)
                return (
                  <tr key={o.id} className={cn(!o.conta_para_receita && 'opacity-60', mudou && 'bg-warn-soft/40')}>
                    <td>
                      <div className="font-medium">{o.cliente_nome}{o.nao_cadastrado && <Badge variant="warn" className="ml-1.5">não cadastrado</Badge>}</div>
                      <div className="text-micro text-fg-subtle">{o.conta ?? TRACO}{o.assessor_nome ? ` · ${o.assessor_nome}` : ''}</div>
                    </td>
                    <td className="num">{o.ativo ?? TRACO}</td>
                    <td>
                      <Badge variant={t.variant}>{t.label}</Badge>
                      {!o.conta_para_receita && <Badge variant="neutral" className="ml-1">antes da migração</Badge>}
                    </td>
                    <td className="num">{fmtNum(o.qtd)}</td>
                    <td className="num">
                      {pode ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            inputMode="decimal"
                            value={valores[o.id] ?? ''}
                            onChange={e => setValores(v => ({ ...v, [o.id]: e.target.value }))}
                            className={cn('h-8 w-24 text-right', mudou && 'border-warn')}
                            aria-label={`Corretagem de ${o.cliente_nome} em ${o.ativo ?? 'ativo'}`}
                          />
                          <span className="w-10 text-left text-micro text-fg-subtle">{t.unidade}</span>
                          <IconButton
                            aria-label={`Voltar ao cadastro (${fmtEntrada(o.tarifa_padrao)})`}
                            title={`Voltar ao cadastro: ${fmtEntrada(o.tarifa_padrao)}${t.unidade}`}
                            onClick={() => restaurar(o)}
                            disabled={!foraDoPadrao}
                            className="h-8 w-8"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          </IconButton>
                        </div>
                      ) : (
                        <span>{n2(o.tipo === 'zeragem' ? o.zeragem_rs : o.tarifa)} <span className="text-micro text-fg-subtle">{t.unidade}</span></span>
                      )}
                      {o.tarifa_manual != null && !mudou && <div className="text-micro text-warn">manual · cadastro {fmtEntrada(o.tarifa_padrao)}</div>}
                    </td>
                    <td className={cn('num', mudou && 'font-semibold')}>{r0(receitaDe(o))}</td>
                    <td className="muted col-p3">{o.modo ?? TRACO}{o.plataforma ? ` · ${o.plataforma}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
            {linhas.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={3}>{fmtNum(linhas.length)} operações</td>
                  <td className="num">{fmtNum(lotes)}</td>
                  <td className="num muted">{alteradas.length ? `${alteradas.length} a salvar` : TRACO}</td>
                  <td className="num">{r0(receita)}</td>
                  <td className="col-p3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!admin && <p className="mt-3 text-label text-fg-subtle">Só administradores alteram corretagens.</p>}
      </Panel>
    </>
  )
}
