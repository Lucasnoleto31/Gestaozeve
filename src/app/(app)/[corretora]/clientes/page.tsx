export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { CHAVES_FILTRO_CLIENTES, cookieFiltrosClientes, filtrosIniciais } from '@/lib/filtrosLista'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { assessoresPorCorretora, clientesLista, responsaveisAtivos } from '@/lib/gestao/consultas'
import { resumoClientes } from '@/lib/gestao/derivados'
import { mesCurto, mesLongo, somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { temListaPropria } from '@/lib/corretoras'
import { getProfile } from '@/lib/auth/getProfile'
import { compactar } from '@/lib/compacto'
import { CAMPOS_CLIENTE_LINHA } from '@/lib/gestao/tipos'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { MesPicker } from '@/components/gestao/Filtros'
import { TabelaClientes } from './TabelaClientes'
import { BuscaCliente } from './BuscaCliente'
import { NovoClienteButton } from './NovoClienteButton'

export default async function ClientesPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base, q } = ctx
  // filtros da tabela: os do endereço; sem nenhum no endereço (seta da ficha, menu), os últimos usados
  const fi = filtrosIniciais(q, (await cookies()).get(cookieFiltrosClientes(corretora))?.value, CHAVES_FILTRO_CLIENTES)
  const listaPropria = temListaPropria(corretora)
  const [clientes, responsaveis, assessores, profile] = await Promise.all([
    clientesLista(corretora, mesRef), responsaveisAtivos(), assessoresPorCorretora(), getProfile(),
  ])
  const admin = profile?.role === 'admin'
  const r = resumoClientes(clientes)
  const hoje = fmtDate(hojeBrasil())
  const d7 = somarDias(hoje, -7), d30 = somarDias(hoje, -30)
  const migrados7d = clientes.filter(c => c.status === 'Migrado' && c.data_migracao && c.data_migracao >= d7).length
  const entraram30d = clientes.filter(c => c.data_entrada && c.data_entrada >= d30).length
  const emRisco = clientes.filter(c => c.risco).length
  const porNivel = { alto: clientes.filter(c => c.nivel === 'Alto').length, medio: clientes.filter(c => c.nivel === 'Médio').length, baixo: clientes.filter(c => c.nivel === 'Baixo').length }
  const altoEmRisco = clientes.filter(c => c.nivel === 'Alto' && c.risco).length

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Clientes"
        description={listaPropria
          ? `A nossa lista de clientes levados para a ${ctx.label}: status, responsável e tarifa por cliente · giro e situação em ${mesLongo(mesRef)}.`
          : `Um cliente por CPF/CNPJ, com as contas agrupadas · giro e situação em ${mesLongo(mesRef)}.`}
        actions={<>
          <NovoClienteButton corretora={corretora} base={base} responsaveis={responsaveis.filter(x => x.atende_clientes).map(x => x.nome)} assessores={assessores[corretora]} hoje={hoje} />
          <BuscaCliente corretora={corretora} base={base} />
          <MesPicker valor={mesRef} />
        </>}
      />
      <PageBody>
        <KpiRow cols={7}>
          <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(entraram30d)} entraram em 30 dias`} />
          <KpiCard label="Migrados" value={fmtNum(r.migrados)} sub={`${fmtPct(r.taxaMigracao)} da base · ${fmtNum(migrados7d)} nos últimos 7 dias`} />
          <KpiCard label="Em processamento" value={fmtNum(r.emProcessamento)} sub={r.mediaDiasMigrar != null ? `média de ${Math.round(r.mediaDiasMigrar)} dias até migrar` : 'sem data de entrada para medir'} />
          <KpiCard label="Recusaram" value={fmtNum(r.recusaram)} sub={`${fmtPct(r.levados ? (r.recusaram / r.levados) * 100 : 0)} da base`} />
          <KpiCard label="Migrados sem giro" value={fmtNum(r.nuncaGiraram)} sub={`${fmtNum(r.ativosSit)} ativos · ${fmtNum(r.inativos)} inativos em ${mesCurto(mesRef)}${emRisco ? ` · ${fmtNum(emRisco)} em risco` : ''}`} />
          <KpiCard label="Nível alto" value={fmtNum(porNivel.alto)} sub={`${fmtNum(porNivel.medio)} médio · ${fmtNum(porNivel.baixo)} baixo · média de lotes 3 m${altoEmRisco ? ` · ${fmtNum(altoEmRisco)} alto em risco` : ''}`} tone={altoEmRisco ? 'warn' : 'neutral'} />
          <KpiCard label="Com alertas" value={fmtNum(r.comAlertas)} sub="algo a completar no cadastro" tone={r.comAlertas ? 'warn' : 'neutral'} />
        </KpiRow>
        <TabelaClientes
          clientes={compactar(clientes, CAMPOS_CLIENTE_LINHA)} base={base} mesRef={mesRef} corretora={corretora}
          comAcoes podeExcluir={listaPropria && admin}
          atendentes={responsaveis.filter(x => x.atende_clientes).map(x => x.nome)}
          filtrosSalvos={fi} mesParam={ctx.mesEscolhido ? mesRef.slice(0, 7) : null}
        />
      </PageBody>
    </>
  )
}
