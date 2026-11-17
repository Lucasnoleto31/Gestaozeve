export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { CHAVES_FILTRO_CLIENTES, cookieFiltrosClientes, filtrosIniciais } from '@/lib/filtrosLista'
import { contexto, type Params, type SearchParams } from '@/lib/gestao/pagina'
import { assessoresPorCorretora, clientesLista, contatosClientesResumo, responsaveisAtivos } from '@/lib/gestao/consultas'
import { mesCurto, somarDias } from '@/lib/gestao/meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { fmtNum } from '@/lib/format'
import { temListaPropria } from '@/lib/corretoras'
import { getProfile } from '@/lib/auth/getProfile'
import { compactar } from '@/lib/compacto'
import { CAMPOS_CLIENTE_LINHA } from '@/lib/gestao/tipos'
import { COOKIE_VISAO_CLIENTES, visaoClientes } from '@/lib/gestao/listaClientes'
import { giroNasOutrasCorretoras } from '@/lib/gestao/consultasGiroFora'
import type { GiroFora } from '@/lib/gestao/giroFora'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { MesPicker } from '@/components/gestao/Filtros'
import { TabelaClientes } from './TabelaClientes'
import { NovoClienteButton } from './NovoClienteButton'
import { opcoesOrigem as lerOpcoesOrigem } from '@/lib/gestao/consultasOrigens'

// Clientes: quem são e como cada um está. A base aparece separada em grupos (Operando, Em risco,
// Inativos, Nunca operaram, Em abertura) que filtram a lista; quem monta os cartões e a tabela é a
// TabelaClientes. Os números do caminho até o giro (levados, migrados, taxa de migração) ficam no
// Painel › Clientes.
export default async function ClientesPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await contexto(params, searchParams)
  const { corretora, mesRef, base, q } = ctx
  // filtros da tabela: os do endereço; sem nenhum no endereço (seta da ficha, menu), os últimos usados
  const guardados = await cookies()
  const fi = filtrosIniciais(q, guardados.get(cookieFiltrosClientes(corretora))?.value, CHAVES_FILTRO_CLIENTES)
  // colunas à mostra: a visão que a pessoa escolheu da última vez
  const visao = visaoClientes(guardados.get(COOKIE_VISAO_CLIENTES)?.value)
  const listaPropria = temListaPropria(corretora)
  const [lista, responsaveis, assessores, profile, contatos, giroFora, opcoesOrigem] = await Promise.all([
    clientesLista(corretora, mesRef), responsaveisAtivos(), assessoresPorCorretora(), getProfile(), contatosClientesResumo(corretora), giroNasOutrasCorretoras(corretora), lerOpcoesOrigem(),
  ])
  // contatos registrados com cada cliente (campanha de ativação, S52): quantos e o último
  const clientes = lista.map(c => { const x = contatos.get(c.cliente_id); return x ? { ...c, contatos: x.contatos, ultimo_contato: x.ultimo_contato } : c })
  // giro em outra corretora do escritório: só dos clientes desta lista (poucas dezenas)
  const fora: Record<string, GiroFora> = {}
  for (const c of clientes) { const g = giroFora.get(c.cliente_id); if (g) fora[c.cliente_id] = g }
  const admin = profile?.role === 'admin'
  const hoje = fmtDate(hojeBrasil())
  // o movimento recente da base, em uma linha
  const d7 = somarDias(hoje, -7), d30 = somarDias(hoje, -30)
  const migraram7d = clientes.filter(c => c.status === 'Migrado' && c.data_migracao && c.data_migracao >= d7).length
  const entraram30d = clientes.filter(c => c.data_entrada && c.data_entrada >= d30).length
  const contas = clientes.reduce((s, c) => s + c.n_contas, 0)
  const recente = [
    entraram30d ? `${fmtNum(entraram30d)} ${entraram30d === 1 ? 'entrou' : 'entraram'} nos últimos 30 dias` : null,
    migraram7d ? `${fmtNum(migraram7d)} ${migraram7d === 1 ? 'conta migrou' : 'contas migraram'} nos últimos 7` : null,
  ].filter(Boolean).join(' e ')

  return (
    <>
      <PageHeader
        eyebrow={ctx.eyebrow}
        title="Clientes"
        description={`Como está cada cliente em ${mesCurto(mesRef)}. São ${fmtNum(clientes.length)} clientes em ${fmtNum(contas)} contas${recente ? `; ${recente}` : ''}.`}
        actions={<>
          <NovoClienteButton corretora={corretora} base={base} responsaveis={responsaveis.filter(x => x.atende_clientes).map(x => x.nome)} assessores={assessores[corretora]} hoje={hoje} opcoesOrigem={opcoesOrigem} />
          <MesPicker valor={mesRef} />
        </>}
      />
      <PageBody>
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
