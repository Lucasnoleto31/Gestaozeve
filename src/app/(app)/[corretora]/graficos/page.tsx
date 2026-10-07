export const dynamic = 'force-dynamic'

import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import {
  assessoresMensal, clientesLista, diario, funilMensal, funilPor, migracoesDiarias, mixPlataforma, painelMensal, topClientes, ultimaData,
} from '@/lib/gestao/consultas'
import { resumoClientes } from '@/lib/gestao/derivados'
import { ehIso, inicioSemana, janelaMeses, limitesDoMes, mesCurto, somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct, nomeCurto } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { MesPicker } from '@/components/gestao/Filtros'
import { dataCurta, rCurto, TRACO } from '@/components/gestao/Celulas'
import { GraficoBarrasH, GraficoRosca, GraficoSeries } from '@/components/gestao/Graficos'
import { DataRefPicker } from './DataRefPicker'

export default async function GraficosPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, q } = ctx
  const meses = janelaMeses(mesRef, 12)
  const lim = limitesDoMes(mesRef)
  // Duas levas em paralelo: só migrações e diário dependem da última data lançada
  const [ultima, clientes, mensal, porAssessor, top10, mix, funil, porCorretora, porStatus] = await Promise.all([
    ultimaData(corretora),
    clientesLista(corretora, mesRef),
    painelMensal(corretora, mesRef, 12),
    assessoresMensal(corretora, mesRef, 12),
    topClientes(corretora, meses[0], lim.fim, null, 10),
    mixPlataforma(corretora, meses[0], lim.fim),
    funilMensal(mesRef, 12),
    funilPor('corretora', mesRef, 12),
    funilPor('status', mesRef, 12),
  ])
  const ref = ehIso(q.ref) ? q.ref : (ultima ?? fmtDate(hojeBrasil()))
  const ini30 = somarDias(ref, -29)
  const iniSemanas = inicioSemana(somarDias(ref, -77)) // 12 semanas até a semana da referência
  const [migr, dias] = await Promise.all([
    migracoesDiarias(corretora, iniSemanas < ini30 ? iniSemanas : ini30, ref),
    diario(corretora, iniSemanas, ref),
  ])

  const r = resumoClientes(clientes)
  const migr30 = migr.filter(m => m.dia >= ini30)
  const migrados30 = migr30.reduce((s, m) => s + m.migrados, 0)
  const entradas30 = migr30.reduce((s, m) => s + m.entradas, 0)
  const migrados12s = migr.filter(m => m.dia >= iniSemanas).reduce((s, m) => s + m.migrados, 0)
  const dias30 = dias.filter(d => d.dia >= ini30)
  const lotes30 = dias30.reduce((s, d) => s + d.lotes, 0)
  const receita30 = dias30.reduce((s, d) => s + d.receita, 0)
  const lotes12 = clientes.reduce((s, c) => s + c.lotes_12m, 0)
  const top5 = [...clientes].sort((a, b) => b.lotes_12m - a.lotes_12m).slice(0, 5).reduce((s, c) => s + c.lotes_12m, 0)

  // Séries por dia (30 dias) e por semana (12 semanas)
  const porDia = Array.from({ length: 30 }, (_, i) => somarDias(ini30, i)).map(d => {
    const m = migr.find(x => x.dia === d)
    return { label: dataCurta(d).slice(0, 5), migrados: m?.migrados ?? 0, entradas: m?.entradas ?? 0 }
  })
  const semanas = Array.from({ length: 12 }, (_, i) => somarDias(iniSemanas, i * 7))
  const acumAntes = migr.find(m => m.dia >= iniSemanas)
  const baseAntes = acumAntes ? acumAntes.acumulado - acumAntes.migrados : (migr.length ? migr[migr.length - 1].acumulado : r.migrados)
  const acumulados = semanas.reduce<number[]>((acc, s) => {
    const fimS = somarDias(s, 6)
    const mig = migr.filter(m => m.dia >= s && m.dia <= fimS).reduce((a, m) => a + m.migrados, 0)
    acc.push((acc[acc.length - 1] ?? baseAntes) + mig)
    return acc
  }, [])
  const porSemana = semanas.map((s, i) => {
    const fimS = somarDias(s, 6)
    const ms = migr.filter(m => m.dia >= s && m.dia <= fimS)
    return { label: `Sem ${dataCurta(s).slice(0, 5)}`, migrados: ms.reduce((a, m) => a + m.migrados, 0), entradas: ms.reduce((a, m) => a + m.entradas, 0), acumulado: acumulados[i],
      lotes: dias.filter(d => d.dia >= s && d.dia <= fimS).reduce((a, d) => a + d.lotes, 0) }
  })

  const mensalMap = new Map(mensal.map(m => [m.mes_ref, m]))
  const porMes = meses.map(m => {
    const x = mensalMap.get(m)
    return { label: mesCurto(m), migrados: x?.novas_migracoes ?? 0, entradas: x?.entradas ?? 0, ativos: x?.clientes_ativos ?? 0, corretagem: x?.receita_corretagem ?? 0, zeragem: x?.receita_zeragem ?? 0 }
  })

  // Lotes por mês por assessor: Top 8 + Outros
  const totalPorAssessor = new Map<string, number>()
  for (const a of porAssessor) totalPorAssessor.set(a.assessor_nome, (totalPorAssessor.get(a.assessor_nome) ?? 0) + a.lotes)
  const top8 = [...totalPorAssessor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0])
  const chaveAss = (n: string) => (top8.includes(n) ? n : 'Outros')
  const lotesAssessorMes = meses.map(m => {
    const linha: Record<string, string | number> = { label: mesCurto(m) }
    for (const n of [...top8, 'Outros']) linha[n] = 0
    for (const a of porAssessor.filter(x => x.mes_ref === m)) linha[chaveAss(a.assessor_nome)] = (linha[chaveAss(a.assessor_nome)] as number) + a.lotes
    return linha
  })
  const seriesAssessor = [...top8, 'Outros'].map(n => ({ key: n, nome: nomeCurto(n, 14), tipo: 'bar' as const, empilhar: 'a' }))

  const funilMap = new Map(funil.map(f => [f.mes_ref, f]))
  const leadsMes = meses.map(m => {
    const f = funilMap.get(m)
    return { label: mesCurto(m), recebidos: f?.recebidos ?? 0, clientes: f?.ja_clientes ?? 0, ganhos: f?.ganhos ?? 0, perdidos: f?.perdidos ?? 0 }
  })

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Gráficos"
        description={`Migração e giro ao longo do tempo · referência ${dataCurta(ref)} · janela de 12 meses até ${mesCurto(mesRef)}.`}
        actions={<><DataRefPicker valor={ref} /><MesPicker valor={mesRef} label="Janela até" /></>}
      />
      <PageBody>
        <KpiRow cols={7}>
          <KpiCard label="Base migrada" value={fmtNum(r.migrados)} sub={`${fmtNum(r.levados)} levados · ${fmtPct(r.taxaMigracao, 0)}`} />
          <KpiCard label="Migrados · 30 dias" value={fmtNum(migrados30)} sub={`${fmtNum(entradas30)} entradas`} />
          <KpiCard label="Migrados · 12 semanas" value={fmtNum(migrados12s)} sub={`${(migrados12s / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por semana`} />
          <KpiCard label="Lotes · 30 dias" value={fmtNum(lotes30)} sub={rCurto(receita30)} />
          <KpiCard label="Em processamento" value={fmtNum(r.emProcessamento)} sub={`${fmtNum(r.recusaram)} recusaram`} />
          <KpiCard label="Concentração top 5" value={lotes12 ? fmtPct((top5 / lotes12) * 100, 0) : TRACO} sub="dos lotes 12 m em 5 clientes" />
          <KpiCard label="Sem giro" value={fmtNum(r.nuncaGiraram)} sub={`${fmtNum(r.inativos)} inativos`} />
        </KpiRow>

        <Panel title="Lotes girados por semana" subtitle="Últimas 12 semanas.">
          <GraficoSeries dados={porSemana} series={[{ key: 'lotes', nome: 'Lotes', tipo: 'bar' }]} altura={260} legenda={false} />
        </Panel>

        <div className="grid gap-8 xl:grid-cols-2">
          <Panel title="Migrados e entradas por dia" subtitle="Últimos 30 dias.">
            <GraficoSeries dados={porDia} series={[{ key: 'migrados', nome: 'Migrados', tipo: 'bar' }, { key: 'entradas', nome: 'Entradas', tipo: 'bar' }]} altura={200} />
          </Panel>
          <Panel title="Migrados e entradas por semana" subtitle="12 semanas, com a base migrada acumulada.">
            <GraficoSeries dados={porSemana} series={[{ key: 'migrados', nome: 'Migrados', tipo: 'bar' }, { key: 'entradas', nome: 'Entradas', tipo: 'bar' }, { key: 'acumulado', nome: 'Base acumulada', tipo: 'line', eixo: 'dir' }]} formatoDir="num" altura={200} />
          </Panel>
          <Panel title="Migrados e entradas por mês" subtitle="12 meses.">
            <GraficoSeries dados={porMes} series={[{ key: 'migrados', nome: 'Migrados', tipo: 'bar' }, { key: 'entradas', nome: 'Entradas', tipo: 'bar' }]} altura={200} />
          </Panel>
          <Panel title="Clientes ativos por mês" subtitle="Com giro no mês.">
            <GraficoSeries dados={porMes} series={[{ key: 'ativos', nome: 'Clientes ativos', tipo: 'bar' }]} altura={200} legenda={false} />
          </Panel>
          <Panel title="Lotes por mês por assessor" subtitle="Top 8 + outros.">
            <GraficoSeries dados={lotesAssessorMes} series={seriesAssessor} altura={240} />
          </Panel>
          <Panel title="Receita mensal" subtitle="Corretagem + zeragem.">
            <GraficoSeries dados={porMes} series={[{ key: 'corretagem', nome: 'Corretagem', tipo: 'bar', empilhar: 'r' }, { key: 'zeragem', nome: 'Zeragem', tipo: 'bar', empilhar: 'r' }]} formato="brl" altura={240} />
          </Panel>
          <Panel title="Top 10 clientes" subtitle="Lotes em 12 meses.">
            <GraficoBarrasH dados={top10.map(c => ({ nome: nomeCurto(c.cliente_nome, 28), valor: c.lotes }))} larguraRotulo={190} />
          </Panel>
          <Panel title="Funil da base" subtitle="Status dos clientes levados.">
            <GraficoRosca dados={[{ nome: 'Migrado', valor: r.migrados }, { nome: 'Em processamento', valor: r.emProcessamento }, { nome: 'Recusou', valor: r.recusaram }]} />
          </Panel>
          <Panel title="Mix de plataforma" subtitle="Lotes em 12 meses.">
            <GraficoRosca dados={mix.map(m => ({ nome: m.plataforma, valor: m.lotes }))} />
          </Panel>
          <Panel title="Leads por mês" subtitle="Recebidos, já clientes, ganhos e perdidos.">
            <GraficoSeries dados={leadsMes} series={[{ key: 'recebidos', nome: 'Recebidos', tipo: 'bar' }, { key: 'clientes', nome: 'Já clientes', tipo: 'bar' }, { key: 'ganhos', nome: 'Ganhos', tipo: 'bar', cor: 'gain' }, { key: 'perdidos', nome: 'Perdidos', tipo: 'bar', cor: 'loss' }]} altura={240} />
          </Panel>
          <Panel title="Leads por corretora onde já operam">
            <GraficoBarrasH dados={porCorretora.map(x => ({ nome: x.grupo, valor: x.leads }))} larguraRotulo={110} />
          </Panel>
          <Panel title="Leads por status">
            <GraficoBarrasH dados={porStatus.map(x => ({ nome: x.grupo, valor: x.leads }))} larguraRotulo={110} />
          </Panel>
        </div>
      </PageBody>
    </>
  )
}
