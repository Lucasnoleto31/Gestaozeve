export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { CHAVES_FILTRO_CLIENTES, cookieFiltrosClientes, filtrosIniciais } from '@/lib/filtrosLista'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { assessoresPorCorretora, clientesLista, contatosClientesResumo, responsaveisAtivos } from '@/lib/gestao/consultas'
import { resumoClientes } from '@/lib/gestao/derivados'
import { mesCurto, mesLongo, somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum, fmtPct } from '@/lib/format'
import { temListaPropria } from '@/lib/corretoras'
import { getProfile } from '@/lib/auth/getProfile'
import { compactar } from '@/lib/compacto'
import { CAMPOS_CLIENTE_LINHA } from '@/lib/gestao/tipos'
import { COOKIE_VISAO_CLIENTES, visaoClientes } from '@/lib/gestao/listaClientes'
import { giroNasOutrasCorretoras } from '@/lib/gestao/consultasGiroFora'
import type { GiroFora } from '@/lib/gestao/giroFora'
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
  const guardados = await cookies()
  const fi = filtrosIniciais(q, guardados.get(cookieFiltrosClientes(corretora))?.value, CHAVES_FILTRO_CLIENTES)
  // colunas à mostra: a visão que a pessoa escolheu da última vez
  const visao = visaoClientes(guardados.get(COOKIE_VISAO_CLIENTES)?.value)
  const listaPropria = temListaPropria(corretora)
  const [lista, responsaveis, assessores, profile, contatos, giroFora] = await Promise.all([
    clientesLista(corretora, mesRef), responsaveisAtivos(), assessoresPorCorretora(), getProfile(), contatosClientesResumo(corretora), giroNasOutrasCorretoras(corretora),
  ])
  // contatos registrados com cada cliente (campanha de ativação, S52): quantos e o último
  const clientes = lista.map(c => { const x = contatos.get(c.cliente_id); return x ? { ...c, contatos: x.contatos, ultimo_contato: x.ultimo_contato } : c })
  // giro em outra corretora do escritório: só dos clientes desta lista (poucas dezenas)
  const fora: Record<string, GiroFora> = {}
  for (const c of clientes) { const g = giroFora.get(c.cliente_id); if (g) fora[c.cliente_id] = g }
  const admin = profile?.role === 'admin'
  const r = resumoClientes(clientes)
  const hoje = fmtDate(hojeBrasil())
  const d7 = somarDias(hoje, -7), d30 = somarDias(hoje, -30)
  const migrados7d = clientes.filter(c => c.status === 'Migrado' && c.data_migracao && c.data_migracao >= d7).length
  const entraram30d = clientes.filter(c => c.data_entrada && c.data_entrada >= d30).length
  const emRisco = clientes.filter(c => c.risco).length
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
          <BuscaCliente corretora={corretora} base={base} placeholder="Abrir a ficha: nome, CPF, conta…" />
          <MesPicker valor={mesRef} />
        </>}
      />
      <PageBody>
        {/* A base em seis números: quem gira no mês (o destaque), o tamanho da base e o caminho até o giro.
            As contagens por situação, "em risco" e "com alertas" ficam nos botões da lista, que filtram. */}
        <KpiRow cols={6}>
          <KpiCard destaque label={`Ativos em ${mesCurto(mesRef)}`} value={fmtNum(r.ativosSit)} sub={`${fmtPct(r.migrados ? (r.ativosSit / r.migrados) * 100 : 0)} dos migrados · ${fmtNum(r.inativos)} inativos`} />
          <KpiCard label="Clientes levados" value={fmtNum(r.levados)} sub={`${fmtNum(r.contas)} contas · ${fmtNum(entraram30d)} entraram em 30 dias`} />
          <KpiCard label="Migrados" value={fmtNum(r.migrados)} sub={`${fmtPct(r.taxaMigracao)} da base · ${fmtNum(migrados7d)} nos últimos 7 dias`} />
          <KpiCard label="Em processamento" value={fmtNum(r.emProcessamento)}
            sub={`${r.mediaDiasMigrar != null ? `média de ${Math.round(r.mediaDiasMigrar)} dias até migrar` : 'sem data de entrada para medir'} · ${fmtNum(r.recusaram)} recusaram (${fmtPct(r.levados ? (r.recusaram / r.levados) * 100 : 0)})`} />
          <KpiCard label="Migrados sem giro" value={fmtNum(r.nuncaGiraram)} sub="migraram e ainda não operaram" />
          <KpiCard label="Em risco" value={fmtNum(emRisco)} tone={emRisco ? 'warn' : 'neutral'}
            sub={emRisco ? `giravam e pararam ou caíram · ${fmtNum(altoEmRisco)} de nível alto` : 'ninguém parou ou caiu'} />
        </KpiRow>
        <TabelaClientes
          clientes={compactar(clientes, CAMPOS_CLIENTE_LINHA)} base={base} mesRef={mesRef} corretora={corretora}
          comAcoes podeExcluir={listaPropria && admin}
          atendentes={responsaveis.filter(x => x.atende_clientes).map(x => x.nome)}
          filtrosSalvos={fi} visaoInicial={visao} fora={fora} mesParam={ctx.mesEscolhido ? mesRef.slice(0, 7) : null}
        />
      </PageBody>
    </>
  )
}
