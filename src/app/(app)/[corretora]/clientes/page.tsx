export const dynamic = 'force-dynamic'

import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { clientesLista } from '@/lib/gestao/consultas'
import { resumoClientes } from '@/lib/gestao/derivados'
import { mesCurto, mesLongo, somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { MesPicker } from '@/components/gestao/Filtros'
import { TabelaClientes } from './TabelaClientes'
import { BuscaCliente } from './BuscaCliente'

export default async function ClientesPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base, q } = ctx
  const clientes = await clientesLista(corretora, mesRef)
  const r = resumoClientes(clientes)
  const hoje = fmtDate(hojeBrasil())
  const d7 = somarDias(hoje, -7), d30 = somarDias(hoje, -30)
  const migrados7d = clientes.filter(c => c.status === 'Migrado' && c.data_migracao && c.data_migracao >= d7).length
  const entraram30d = clientes.filter(c => c.data_entrada && c.data_entrada >= d30).length

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Clientes"
        description={`Um cliente por CPF/CNPJ, com as contas agrupadas · giro e situação em ${mesLongo(mesRef)}.`}
        actions={<><BuscaCliente corretora={corretora} base={base} /><MesPicker valor={mesRef} /></>}
      />
      <PageBody>
        <KpiRow cols={6}>
          <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(entraram30d)} entraram em 30 dias`} />
          <KpiCard label="Migrados" value={fmtNum(r.migrados)} sub={`${fmtPct(r.taxaMigracao)} da base · ${fmtNum(migrados7d)} nos últimos 7 dias`} />
          <KpiCard label="Em processamento" value={fmtNum(r.emProcessamento)} sub={r.mediaDiasMigrar != null ? `média de ${Math.round(r.mediaDiasMigrar)} dias até migrar` : 'sem data de entrada para medir'} />
          <KpiCard label="Recusaram" value={fmtNum(r.recusaram)} sub={`${fmtPct(r.levados ? (r.recusaram / r.levados) * 100 : 0)} da base`} />
          <KpiCard label="Migrados sem giro" value={fmtNum(r.nuncaGiraram)} sub={`${fmtNum(r.ativosSit)} ativos · ${fmtNum(r.inativos)} inativos em ${mesCurto(mesRef)}`} />
          <KpiCard label="Com alertas" value={fmtNum(r.comAlertas)} sub="algo a completar no cadastro" tone={r.comAlertas ? 'warn' : 'neutral'} />
        </KpiRow>
        <TabelaClientes clientes={clientes} base={base} mesRef={mesRef} filtrosIniciais={{ situacao: q.situacao ?? '', status: q.status ?? '', alerta: q.alerta ?? '', responsavel: q.responsavel ?? '', assessor: q.assessor ?? '', busca: q.busca ?? '' }} />
      </PageBody>
    </>
  )
}
