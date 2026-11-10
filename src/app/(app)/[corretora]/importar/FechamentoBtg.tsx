'use client'

// Fechamento do mês do BTG na tela: sobe a planilha que o BTG manda, o sistema cruza cliente × dia ×
// ativo com os lotes do mês e mostra o plano (corretagem paga por operação, lançamentos que faltaram,
// o que fica de resíduo e o que está fora do giro); um clique aplica, outro desfaz.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileSpreadsheet, Undo2 } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { useToast } from '@/components/ui/Toast'
import { LinhaVazia, TRACO, dataCurta, n0, r0 } from '@/components/gestao/Celulas'
import { lerAbas } from '@/lib/gestao/lerArquivo'
import { aplicavel, escolhasDoPlano, lerFechamentoBtg, type CasoFechamento, type LeituraFechamento } from '@/lib/gestao/fechamento'
import { aplicarFechamentoBtg, desfazerFechamentoBtg, prepararFechamentoBtg, type Conferencia } from '@/lib/gestao/acoesFechamento'
import type { FechamentoAplicado } from '@/lib/gestao/consultasFechamento'
import { mesLongo } from '@/lib/gestao/meses'
import { fmtDataHoraPt, fmtNum, fmtPct } from '@/lib/format'
import type { Corretora } from '@/lib/corretoras'
import { cn } from '@/lib/utils'

type Lido = Extract<LeituraFechamento, { ok: true }>
type Estado =
  | { fase: 'vazio' }
  | { fase: 'lendo' }
  | { fase: 'erro'; erro: string }
  | { fase: 'lido'; nome: string; leitura: Lido }
  | { fase: 'conferindo'; nome: string; leitura: Lido }
  | { fase: 'plano'; nome: string; leitura: Lido; conf: Conferencia; marcados: Set<string>; gravarPct: boolean; erro?: string }
  | { fase: 'aplicando'; nome: string; leitura: Lido; conf: Conferencia; marcados: Set<string>; gravarPct: boolean }
  | { fase: 'aplicado'; nome: string; resultado: { nome: string; ajustadas: number; inseridas: number; pct: number | null } }

const TIPO: Record<CasoFechamento['acao']['tipo'], { label: string; variant: BadgeVariant }> = {
  tarifa: { label: 'Corretagem', variant: 'accent' },
  inserir: { label: 'Lançar', variant: 'gain' },
  residuo: { label: 'Resíduo', variant: 'loss' },
  manter: { label: 'Mantido', variant: 'neutral' },
  sem_inferencia: { label: 'Conferir', variant: 'warn' },
}

export function FechamentoBtg({ corretora, base, aplicados, zeragemManual }: { corretora: Corretora; base: string; aplicados: FechamentoAplicado[]; zeragemManual: boolean }) {
  const router = useRouter()
  const { avisar } = useToast()
  const [estado, setEstado] = useState<Estado>({ fase: 'vazio' })
  const [desfazendo, setDesfazendo] = useState<string | null>(null)
  const [erroDesfazer, setErroDesfazer] = useState<string | null>(null)
  const ocupado = estado.fase === 'lendo' || estado.fase === 'conferindo' || estado.fase === 'aplicando'

  const escolher = async (file: File | null) => {
    if (!file) return
    setEstado({ fase: 'lendo' })
    try {
      const r = lerFechamentoBtg(await lerAbas(file))
      if (!r.ok) { setEstado({ fase: 'erro', erro: r.erro }); return }
      setEstado({ fase: 'lido', nome: file.name, leitura: r })
    } catch (e) {
      setEstado({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui ler o arquivo' })
    }
  }

  const conferir = async () => {
    if (estado.fase !== 'lido') return
    const { nome, leitura } = estado
    setEstado({ fase: 'conferindo', nome, leitura })
    const r = await prepararFechamentoBtg(corretora, leitura.mes, leitura.linhas)
    if (!r.ok) { setEstado({ fase: 'erro', erro: r.erro }); return }
    setEstado({ fase: 'plano', nome, leitura, conf: r.dados, marcados: new Set(r.dados.plano.casos.filter(aplicavel).map(c => c.chave)), gravarPct: leitura.resumo.pctComissao != null })
  }

  const alternar = (chave: string) => {
    if (estado.fase !== 'plano') return
    const m = new Set(estado.marcados)
    if (m.has(chave)) m.delete(chave); else m.add(chave)
    setEstado({ ...estado, marcados: m })
  }
  const marcarTodos = (sim: boolean) => {
    if (estado.fase !== 'plano') return
    setEstado({ ...estado, marcados: new Set(sim ? estado.conf.plano.casos.filter(aplicavel).map(c => c.chave) : []) })
  }

  const aplicar = async () => {
    if (estado.fase !== 'plano') return
    const { nome, leitura, conf, marcados, gravarPct } = estado
    const { updates, inserts } = escolhasDoPlano(conf.plano, marcados)
    const pct = gravarPct ? leitura.resumo.pctComissao : null
    const partes = [
      updates.length ? `${fmtNum(updates.length)} ${updates.length === 1 ? 'operação com corretagem ajustada' : 'operações com corretagem ajustada'}` : null,
      inserts.length ? `${fmtNum(inserts.length)} ${inserts.length === 1 ? 'lançamento novo' : 'lançamentos novos'}` : null,
      pct != null ? `comissão do mês ${fmtPct(pct)}` : null,
    ].filter(Boolean)
    if (!partes.length) { setEstado({ ...estado, erro: 'Nada marcado para aplicar.' }); return }
    if (!confirm(`Aplicar o fechamento de ${mesLongo(leitura.mes)}?\n\n${partes.join('\n')}\n\nDá para desfazer depois, em "Fechamentos aplicados".`)) return
    setEstado({ fase: 'aplicando', nome, leitura, conf, marcados, gravarPct })
    const r = await aplicarFechamentoBtg(corretora, { mes: leitura.mes, origem: nome, updates, inserts, pct, versao: conf.versao })
    if (!r.ok) { setEstado({ fase: 'plano', nome, leitura, conf, marcados, gravarPct, erro: r.erro }); return }
    setEstado({ fase: 'aplicado', nome, resultado: r.dados })
    avisar({ titulo: 'Fechamento aplicado', detalhe: partes.join(' · '), tom: 'gain' })
    router.refresh()
  }

  const desfazer = async (f: FechamentoAplicado) => {
    if (!confirm(`Desfazer "${f.nome_arquivo}"?\n\nAs ${fmtNum(f.ajustadas)} corretagens voltam ao que eram, os ${fmtNum(f.inseridas)} lançamentos novos são apagados${f.pct != null ? ' e o % de comissão do mês volta ao anterior' : ''}.`)) return
    setDesfazendo(f.id); setErroDesfazer(null)
    const r = await desfazerFechamentoBtg(corretora, f.id)
    setDesfazendo(null)
    if (!r.ok) { setErroDesfazer(r.erro); return }
    avisar({ titulo: 'Fechamento desfeito', detalhe: f.nome_arquivo, tom: 'neutral' })
    if (estado.fase === 'aplicado') setEstado({ fase: 'vazio' })
    router.refresh()
  }

  return (
    <>
      <Panel variant="card" title="Fechamento do mês" subtitle="A planilha que o BTG manda (“Artur Fonseca_<mês>.xlsx”, uma aba por livro). O sistema cruza cliente × dia × ativo com os lotes do mês e propõe os ajustes; você confere e aplica.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-line-strong px-4 text-body text-fg-muted hover:bg-surface-2 hover:text-fg', ocupado && 'pointer-events-none opacity-50')}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Escolher a planilha do fechamento…
            <input type="file" accept=".xlsx,.xls" className="sr-only" disabled={ocupado} onChange={e => { escolher(e.target.files?.[0] ?? null); e.target.value = '' }} />
          </label>
          {!zeragemManual && <p className="text-label text-fg-subtle">Zeragem não paga fica como resíduo até rodar a S60 no Supabase.</p>}
        </div>

        {estado.fase === 'lendo' && <Alert tone="neutral">Lendo a planilha…</Alert>}
        {estado.fase === 'erro' && <Alert tone="loss" title="Não deu">{estado.erro}</Alert>}

        {(estado.fase === 'lido' || estado.fase === 'conferindo') && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Resumo label="Arquivo" valor={estado.nome} />
              <Resumo label="Mês" valor={mesLongo(estado.leitura.mes)} sub={`${fmtNum(estado.leitura.resumo.dias)} dias com receita`} />
              <Resumo label="Linhas" valor={fmtNum(estado.leitura.resumo.linhas)} sub={estado.leitura.resumo.porAba.map(a => `${a.aba}: ${fmtNum(a.linhas)}`).join(' · ')} />
              <Resumo label="Renda variável (bruta)" valor={r0(estado.leitura.resumo.rv.bruta)} sub={`${fmtNum(estado.leitura.resumo.rv.linhas)} linhas de BMF e Bolsa`} />
              <Resumo label="Comissão do mês" valor={estado.leitura.resumo.pctComissao != null ? fmtPct(estado.leitura.resumo.pctComissao) : TRACO} sub="comissão ÷ líquida (RV)" />
              <Resumo label="Fora do giro (bruta)" valor={r0(estado.leitura.resumo.foraRv.reduce((s, p) => s + p.bruta, 0))} sub={estado.leitura.resumo.foraRv.map(p => p.produto).join(', ') || 'nada'} />
            </div>
            {estado.leitura.avisos.map((a, i) => <Alert key={i} tone="warn">{a}</Alert>)}
            <div className="flex gap-2">
              <Button onClick={conferir} loading={estado.fase === 'conferindo'}>Conferir com o sistema</Button>
              <Button variant="ghost" onClick={() => setEstado({ fase: 'vazio' })} disabled={estado.fase === 'conferindo'}>Cancelar</Button>
            </div>
          </div>
        )}

        {(estado.fase === 'plano' || estado.fase === 'aplicando') && <PlanoView estado={estado} base={base} alternar={alternar} marcarTodos={marcarTodos} aplicar={aplicar}
          gravarPct={v => { if (estado.fase === 'plano') setEstado({ ...estado, gravarPct: v }) }} cancelar={() => setEstado({ fase: 'vazio' })} />}

        {estado.fase === 'aplicado' && (
          <Alert tone="gain" title={`Fechamento aplicado: ${estado.resultado.nome}`}>
            <ul className="list-disc pl-4">
              <li>{fmtNum(estado.resultado.ajustadas)} {estado.resultado.ajustadas === 1 ? 'operação com corretagem ajustada' : 'operações com corretagem ajustada'} · {fmtNum(estado.resultado.inseridas)} {estado.resultado.inseridas === 1 ? 'lançamento novo' : 'lançamentos novos'}</li>
              {estado.resultado.pct != null && <li>Comissão do mês gravada em Parâmetros (repasse_pct_mes): {fmtPct(estado.resultado.pct)}</li>}
              <li>Receita, comissão e repasse do mês recalculados. <Link href={`${base}/painel`} className="link inline-flex items-center gap-1">Ver no Painel <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></li>
            </ul>
          </Alert>
        )}
      </Panel>

      {aplicados.length > 0 && (
        <Panel title="Fechamentos aplicados" subtitle="Cada um é uma importação protegida com o retrato do que mudou; desfazer volta as corretagens, apaga os lançamentos novos e o % do mês.">
          {erroDesfazer && <Alert tone="loss" className="mb-3">{erroDesfazer}</Alert>}
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th>Quando</th><th>Mês</th><th>Planilha</th><th className="num">Corretagens</th><th className="num">Lançamentos</th><th className="num col-p2">Comissão</th><th className="col-p3">Por</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {aplicados.map(f => (
                  <tr key={f.id}>
                    <td className="num whitespace-nowrap">{fmtDataHoraPt(f.created_at)}</td>
                    <td>{f.mes ? mesLongo(f.mes) : TRACO}</td>
                    <td className="max-w-[260px] truncate" title={f.origem ?? f.nome_arquivo}>{f.origem ?? f.nome_arquivo}</td>
                    <td className="num">{n0(f.ajustadas)}</td>
                    <td className="num">{n0(f.inseridas)}</td>
                    <td className="num col-p2">{f.pct != null ? fmtPct(f.pct) : TRACO}</td>
                    <td className="muted col-p3">{f.criado_por_nome ?? TRACO}</td>
                    <td className="text-right"><Button variant="ghost" size="xs" loading={desfazendo === f.id} onClick={() => desfazer(f)}><Undo2 className="h-3.5 w-3.5" aria-hidden />Desfazer</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  )
}

function PlanoView({ estado, base, alternar, marcarTodos, aplicar, gravarPct, cancelar }: {
  estado: Extract<Estado, { fase: 'plano' | 'aplicando' }>
  base: string
  alternar: (chave: string) => void
  marcarTodos: (sim: boolean) => void
  aplicar: () => void
  gravarPct: (v: boolean) => void
  cancelar: () => void
}) {
  const { conf, leitura, marcados } = estado
  const { plano } = conf
  const { updates, inserts } = escolhasDoPlano(plano, marcados)
  const aplicaveis = plano.casos.filter(aplicavel).length
  const pct = leitura.resumo.pctComissao
  const aplicando = estado.fase === 'aplicando'
  const tomDif = Math.abs(plano.totais.dif) < 1 ? 'gain' : plano.totais.dif < 0 ? 'loss' : 'warn'
  return (
    <div className="space-y-4">
      <KpiRow cols={6}>
        <KpiCard label="BTG pagou (RV, líquida)" value={r0(plano.totais.btg)} sub={`bruta × ${fmtPct(100 - 9.65)} · ${fmtNum(leitura.resumo.rv.linhas)} linhas`} />
        <KpiCard label="Lançado no sistema" value={r0(plano.totais.sistema)} sub={`${fmtNum(conf.lotesNoMes)} linhas no mês`} />
        <KpiCard label="Diferença" value={r0(plano.totais.dif)} sub="BTG − sistema" tone={tomDif} />
        <KpiCard label="Casos" value={fmtNum(plano.casos.length)} sub={`${fmtNum(aplicaveis)} com ajuste proposto`} />
        <KpiCard label="Proposto" value={`${fmtNum(plano.totais.aAjustar)} · ${fmtNum(plano.totais.aInserir)}`} sub="corretagens · lançamentos" />
        <KpiCard label="Fica de resíduo" value={r0(plano.totais.residuo)} sub={plano.totais.residuo ? 'zeragem sem ajuste' : 'nada'} tone={plano.totais.residuo ? 'warn' : 'neutral'} />
      </KpiRow>

      {plano.casos.length === 0 ? (
        <Alert tone="gain" title="Tudo bate">Nenhuma diferença acima de R$ 0,04 por cliente, dia e ativo.</Alert>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Marcar todos" checked={marcados.size > 0 && marcados.size === aplicaveis} onChange={e => marcarTodos(e.target.checked)} disabled={aplicando} /></th>
                <th>Cliente</th><th>Dia</th><th className="col-p2">Ativo</th><th className="num">BTG</th><th className="num">Sistema</th><th className="num">Dif.</th><th>O que fazer</th>
              </tr>
            </thead>
            <tbody>
              {plano.casos.map(c => {
                const pode = aplicavel(c)
                const t = TIPO[c.acao.tipo]
                return (
                  <tr key={c.chave} className={cn(!pode && 'opacity-80')}>
                    <td><input type="checkbox" aria-label={`Aplicar ${c.cliente} ${dataCurta(c.data)}`} checked={marcados.has(c.chave)} onChange={() => alternar(c.chave)} disabled={!pode || aplicando} /></td>
                    <td className="max-w-[220px] truncate" title={c.cliente}><Link href={`${base}/clientes/${c.cliente_id}`} className="link">{c.cliente}</Link></td>
                    <td className="num whitespace-nowrap"><Link href={`${base}/lotes/${c.data}`} className="link">{dataCurta(c.data)}</Link></td>
                    <td className="muted col-p2">{c.ativo.replace('FUT:', '').replace('ACAO:', '')}</td>
                    <td className="num">{r0(c.btg)}</td>
                    <td className="num">{r0(c.sistema)}</td>
                    <td className={cn('num', c.dif < 0 ? 'text-loss' : 'text-gain')}>{r0(c.dif)}</td>
                    <td><Badge variant={t.variant}>{t.label}</Badge> <span className="text-label text-fg-muted">{c.acao.resumo}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(leitura.resumo.foraRv.length > 0 || plano.semCadastro.length > 0 || plano.lotesSemCliente > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {leitura.resumo.foraRv.length > 0 && (
            <div>
              <p className="label mb-1">Fora do giro (não entra no sistema)</p>
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Produto</th><th className="num">Linhas</th><th className="num">Bruta</th><th className="num">Comissão</th></tr></thead>
                  <tbody>
                    {leitura.resumo.foraRv.map(p => <tr key={p.produto}><td>{p.produto}</td><td className="num">{n0(p.linhas)}</td><td className="num">{r0(p.bruta)}</td><td className="num">{r0(p.comissao)}</td></tr>)}
                    <tr className="total"><td>Total</td><td className="num">{n0(leitura.resumo.foraRv.reduce((s, p) => s + p.linhas, 0))}</td><td className="num">{r0(leitura.resumo.foraRv.reduce((s, p) => s + p.bruta, 0))}</td><td className="num">{r0(leitura.resumo.foraRv.reduce((s, p) => s + p.comissao, 0))}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-micro text-fg-subtle">Aluguel, CDB, saldo remunerado… o BTG paga, mas não são lotes: ficam fora da receita do sistema.</p>
            </div>
          )}
          {(plano.semCadastro.length > 0 || plano.lotesSemCliente > 0) && (
            <div>
              <p className="label mb-1">Sem cadastro</p>
              <div className="tbl-wrap">
                <table className="tbl tbl-dense">
                  <thead><tr><th>Conta</th><th>Cliente (no BTG)</th><th className="num">Linhas</th><th className="num">Bruta</th></tr></thead>
                  <tbody>
                    {plano.semCadastro.length === 0 && <LinhaVazia colunas={4}>Todas as contas do fechamento estão cadastradas.</LinhaVazia>}
                    {plano.semCadastro.map(s => <tr key={s.conta}><td className="num">{s.conta}</td><td>{s.cliente}</td><td className="num">{n0(s.linhas)}</td><td className="num">{r0(s.bruta)}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-micro text-fg-subtle">
                Contas pagas pelo BTG que o sistema não conhece: cadastre o cliente (Importar › Linhas sem cliente) e confira de novo.
                {plano.lotesSemCliente > 0 && ` ${fmtNum(plano.lotesSemCliente)} ${plano.lotesSemCliente === 1 ? 'lançamento do mês está' : 'lançamentos do mês estão'} sem cliente e ${plano.lotesSemCliente === 1 ? 'ficou' : 'ficaram'} fora do cruzamento.`}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-4 py-3">
        <label className="flex items-center gap-2 text-dense">
          <input type="checkbox" checked={estado.gravarPct} onChange={e => gravarPct(e.target.checked)} disabled={pct == null || aplicando} />
          Gravar {pct != null ? fmtPct(pct) : TRACO} como a comissão que o BTG pagou em {mesLongo(leitura.mes)}
        </label>
        <span className="text-label text-fg-subtle">parâmetro repasse_pct_mes · hoje: {conf.pctAtual != null ? fmtPct(conf.pctAtual) : 'faixas'}</span>
      </div>

      {estado.fase === 'plano' && estado.erro && <Alert tone="loss">{estado.erro}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={aplicar} loading={aplicando} disabled={!updates.length && !inserts.length && !(estado.gravarPct && pct != null)}>
          Aplicar {fmtNum(updates.length)} {updates.length === 1 ? 'corretagem' : 'corretagens'} e {fmtNum(inserts.length)} {inserts.length === 1 ? 'lançamento' : 'lançamentos'}
        </Button>
        <Button variant="ghost" onClick={cancelar} disabled={aplicando}>Cancelar</Button>
        <span className="text-label text-fg-subtle">Faz um retrato antes de gravar: dá para desfazer.</span>
      </div>
    </div>
  )
}

function Resumo({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2">
      <p className="label">{label}</p>
      <p className="truncate text-dense font-semibold text-fg" title={valor}>{valor}</p>
      {sub && <p className="truncate text-micro text-fg-subtle" title={sub}>{sub}</p>}
    </div>
  )
}
