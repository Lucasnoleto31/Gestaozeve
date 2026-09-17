'use client'

import { useEffect, useState } from 'react'
import { Building2, DollarSign, Download, HandCoins, Layers } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { getFechamento, type Fechamento } from '../actions'
import { fmtNum, fmtBRL2, fmtDataPt, labelMesLongo } from '@/lib/format'
import { ultimosMeses } from '@/lib/periodo'
import { cn } from '@/lib/utils'
import { CORRETORA_LABEL, labelCorretora } from '@/lib/corretoras'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { Empty } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'

export function FechamentoView() {
  const { corretora } = useDashboardFilters()
  const meses = ultimosMeses(12)
  const [mes, setMes] = useState(meses[0])
  const [dados, setDados] = useState<Fechamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [exportando, setExportando] = useState(false)

  const shell = useShell()
  useEffect(() => { shell.setIsLoading(carregando) }, [carregando, shell])

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    getFechamento(mes, corretora)
      .then(f => { if (!cancelado) { setDados(f); setErro(f.erros[0] ?? null) } })
      .catch(e => { if (!cancelado) setErro((e as Error).message) })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [mes, corretora])

  const t = dados?.total
  const escopo = corretora ? CORRETORA_LABEL[corretora] : 'todas as corretoras'

  async function baixarExcel() {
    if (!dados) return
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const linha = (r: Fechamento['rows'][number]) => ({
        Corretora: labelCorretora(r.corretora),
        Barra: r.barra_nome,
        'Nº': r.numero ?? '',
        'Lotes operados': r.lotes_operados,
        'Lotes zerados': r.lotes_zerados,
        Clientes: r.clientes,
        'Receita operados': r.receita_operados,
        'Receita zeragem': r.receita_zeragem,
        'Receita outros produtos': r.receita_outros,
        'Receita bruta': r.receita_total,
        '% escritório': Math.round(r.pct_repasse * 10000) / 100,
        'Repasse ao assessor': r.repasse_assessor,
        'Fica com o escritório': r.receita_liquida,
      })
      const ws = XLSX.utils.json_to_sheet([...dados.rows.map(linha), { ...linha(dados.total), Corretora: '', Barra: 'TOTAL' }])
      ws['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 20 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Fechamento')
      XLSX.writeFile(wb, `fechamento-${mes}-${corretora ? corretora.toLowerCase() : 'todas'}.xlsx`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar Excel.')
    }
    setExportando(false)
  }

  return (
    <>
      {erro && <Alert tone="danger">{erro}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="label">Mês</span>
            <select value={mes} onChange={e => setMes(e.target.value)} className="field-sm font-medium text-fg" disabled={carregando}>
              {meses.map(m => <option key={m} value={m}>{labelMesLongo(`${m}-01`)}</option>)}
            </select>
          </div>
          <p className="text-xs text-fg-muted">
            {dados && <>De <strong className="font-medium text-fg">{fmtDataPt(dados.range.inicio)}</strong> a <strong className="font-medium text-fg">{fmtDataPt(dados.range.fim)}</strong> · {escopo}. </>}
            Segue só o filtro de corretora; o período do topo não vale aqui. Repasse = receita bruta × (1 − % do escritório) da tarifa de cada barra.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={baixarExcel} loading={exportando} disabled={!dados || dados.rows.length === 0}>
          <Download className="h-3.5 w-3.5" /> Baixar Excel
        </Button>
      </div>

      <KpiRow>
        <KpiCard icon={Layers} tone="accent" label="Lotes operados" loading={carregando && !dados}
          value={t ? fmtNum(t.lotes_operados) : '—'} sub={t ? `${fmtNum(t.lotes_zerados)} zerados · ${fmtNum(t.clientes)} clientes` : undefined} />
        <KpiCard icon={DollarSign} tone="success" label="Receita bruta" loading={carregando && !dados}
          value={t ? fmtBRL2(t.receita_total) : '—'}
          sub={t ? `operados ${fmtBRL2(t.receita_operados)} · zeragem ${fmtBRL2(t.receita_zeragem)}${t.receita_outros > 0 ? ` · outros ${fmtBRL2(t.receita_outros)}` : ''}` : undefined} />
        <KpiCard icon={HandCoins} tone="warning" label="Repasse aos assessores" loading={carregando && !dados}
          value={t ? fmtBRL2(t.repasse_assessor) : '—'} sub={t && t.receita_total > 0 ? `${((1 - t.pct_repasse) * 100).toFixed(0)}% da receita bruta` : undefined} />
        <KpiCard icon={Building2} tone="info" label="Fica com o escritório" loading={carregando && !dados}
          value={t ? fmtBRL2(t.receita_liquida) : '—'} sub={t && t.receita_total > 0 ? `${(t.pct_repasse * 100).toFixed(0)}% da receita bruta` : undefined} />
      </KpiRow>

      <Panel flush title={`Fechamento de ${labelMesLongo(`${mes}-01`)} por barra`}
        subtitle="Lotes, receita estimada pela tarifa (operados, zeragem e outros produtos), parte do escritório e repasse de cada barra.">
        {!dados || dados.rows.length === 0
          ? <div className="p-5"><Empty loading={carregando}>Sem lotes no mês.</Empty></div>
          : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Barra</th>
                    <th className="num">Lotes op.</th>
                    <th className="num">Lotes ze.</th>
                    <th className="num">Clientes</th>
                    <th className="num">Rec. operados</th>
                    <th className="num">Rec. zeragem</th>
                    <th className="num">Rec. outros</th>
                    <th className="num">Receita bruta</th>
                    <th className="num">% escritório</th>
                    <th className="num">Repasse assessor</th>
                    <th className="num">Escritório</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.rows.map(r => (
                    <tr key={`${r.corretora}|${r.barra_nome}`}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn('font-medium', r.barra_nome === 'Sem barra' ? 'italic text-fg-subtle' : 'text-fg')}>{r.barra_nome}</span>
                          {r.numero && <span className="subtle tabular-nums">{r.numero}</span>}
                          <CorretoraBadge corretora={r.corretora} />
                        </span>
                      </td>
                      <td className="num">{fmtNum(r.lotes_operados)}</td>
                      <td className="num muted">{fmtNum(r.lotes_zerados)}</td>
                      <td className="num muted">{fmtNum(r.clientes)}</td>
                      <td className="num">{fmtBRL2(r.receita_operados)}</td>
                      <td className="num">{fmtBRL2(r.receita_zeragem)}</td>
                      <td className="num muted">{r.receita_outros > 0 ? fmtBRL2(r.receita_outros) : '—'}</td>
                      <td className="num font-semibold text-success">{fmtBRL2(r.receita_total)}</td>
                      <td className="num muted">{(r.pct_repasse * 100).toFixed(0)}%</td>
                      <td className="num text-warning">{fmtBRL2(r.repasse_assessor)}</td>
                      <td className="num font-semibold">{fmtBRL2(r.receita_liquida)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td className="num">{fmtNum(dados.total.lotes_operados)}</td>
                    <td className="num muted">{fmtNum(dados.total.lotes_zerados)}</td>
                    <td className="num muted">{fmtNum(dados.total.clientes)}</td>
                    <td className="num">{fmtBRL2(dados.total.receita_operados)}</td>
                    <td className="num">{fmtBRL2(dados.total.receita_zeragem)}</td>
                    <td className="num muted">{dados.total.receita_outros > 0 ? fmtBRL2(dados.total.receita_outros) : '—'}</td>
                    <td className="num text-success">{fmtBRL2(dados.total.receita_total)}</td>
                    <td className="num muted">{(dados.total.pct_repasse * 100).toFixed(0)}%</td>
                    <td className="num text-warning">{fmtBRL2(dados.total.repasse_assessor)}</td>
                    <td className="num">{fmtBRL2(dados.total.receita_liquida)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
      </Panel>
    </>
  )
}
