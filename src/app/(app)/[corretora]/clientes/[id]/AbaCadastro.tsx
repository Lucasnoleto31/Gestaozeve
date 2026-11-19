// Ficha do cliente › Cadastro: o status da conta, as datas de entrada e migração, os dados do cadastro e
// o que falta completar.
// No celular (DESIGN.md §8) esta aba é também a casa do que saiu do alto da ficha: telefone, CPF/CNPJ,
// e-mail, conta, assessor, campanha de ativação e o Excluir. Com pendência de verdade, ela vem primeiro.
import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Contexto } from '@/lib/gestao/pagina'
import { telefoneCurto } from '@/lib/gestao/listaClientes'
import { CORRETORA_LABEL, temListaPropria } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { Panel } from '@/components/ui/Panel'
import { Dica } from '@/components/ui/Dica'
import { TRACO, dataPt, rCurto } from '@/components/gestao/Celulas'
import { ExcluirClienteButton } from '../ExcluirClienteButton'
import { Copiar } from './Copiar'
import { ListaPendencias, type Ficha, type Pendencia } from './comum'

// Linha que só existe no celular: no computador o dado continua no alto da ficha
function SoNoCelular({ rotulo, children }: { rotulo: ReactNode; children: ReactNode }) {
  return <><dt className="text-fg-subtle md:hidden">{rotulo}</dt><dd className="min-w-0 md:hidden">{children}</dd></>
}

// divisao = quem divide o que o cliente gera neste mês (lista de parceiros da ficha, S61); vazio = sem lista
export function AbaCadastro({ ctx, id, ficha, pendencias, divisao = '', admin, hrefAba }: {
  ctx: Contexto
  id: string
  ficha: Ficha
  pendencias: Pendencia[]
  divisao?: string
  admin: boolean
  hrefAba: (aba: string) => string
}) {
  const { corretora, base } = ctx
  const { resumo, cadastro, contas } = ficha
  if (!cadastro) return null
  const avisos = pendencias.filter(p => p.estado === 'warn').length

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel variant="card" title="Cadastro" subtitle={<span className="max-md:hidden">Dados do export da corretora e os campos manuais da ficha.</span>}>
        {/* celular: a coluna dos nomes tem largura certa (o nome comprido quebra em duas linhas), para o telefone e o CPF caberem inteiros */}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-dense max-md:grid-cols-[7.5rem_minmax(0,1fr)] max-md:gap-y-2.5">
          <SoNoCelular rotulo="Telefone">{cadastro.telefone ? <Copiar valor={cadastro.telefone.replace(/\D/g, '')} rotulo="o telefone">{telefoneCurto(cadastro.telefone)}</Copiar> : TRACO}</SoNoCelular>
          <SoNoCelular rotulo="CPF/CNPJ">{cadastro.documento ? <Copiar valor={cadastro.documento} rotulo="o CPF/CNPJ">{cadastro.documento}</Copiar> : TRACO}</SoNoCelular>
          {cadastro.email && <SoNoCelular rotulo="E-mail"><a href={`mailto:${cadastro.email}`} className="link break-all">{cadastro.email}</a></SoNoCelular>}
          <SoNoCelular rotulo="Conta">
            {resumo?.conta_principal ? <Copiar valor={resumo.conta_principal} rotulo="a conta">{resumo.conta_principal}</Copiar> : TRACO}
            {contas.length > 1 && <Link href={hrefAba('contas')} className="link ml-2.5 whitespace-nowrap">+{contas.length - 1} {contas.length === 2 ? 'conta' : 'contas'}</Link>}
          </SoNoCelular>
          {/* status e datas: saíram do alto da ficha (lá fica só o estado do cliente) e moram aqui */}
          <dt className="text-fg-subtle">Status</dt><dd className={resumo?.status === 'Recusou' ? 'text-loss' : undefined}>{resumo?.status ?? TRACO}</dd>
          {/* a explicação do selo de nível, que no computador aparece ao passar o mouse */}
          {resumo?.nivel && <SoNoCelular rotulo="Nível">{resumo.nivel}{resumo.lotes_media_3m != null && <span className="text-fg-subtle"> · média de {fmtNum(Math.round(resumo.lotes_media_3m))} lotes/mês nos 3 meses anteriores</span>}</SoNoCelular>}
          <dt className="text-fg-subtle">Entrada</dt><dd className="tabular-nums">{dataPt(resumo?.data_entrada)}</dd>
          <dt className="text-fg-subtle">Migração</dt>
          <dd className="tabular-nums">
            {dataPt(resumo?.data_migracao)}
            {resumo?.data_migracao && resumo.dias_ate_migrar != null && resumo.dias_ate_migrar >= 0 && <span className="text-fg-subtle"> · {resumo.dias_ate_migrar} {resumo.dias_ate_migrar === 1 ? 'dia' : 'dias'} depois da entrada</span>}
          </dd>
          <dt className="text-fg-subtle">Tipo</dt><dd>{cadastro.tipo_pessoa ?? TRACO}</dd>
          <dt className="text-fg-subtle">Perfil</dt><dd>{cadastro.perfil ?? TRACO}{cadastro.perfil_suitability ? ` · ${cadastro.perfil_suitability}` : ''}</dd>
          <dt className="text-fg-subtle">UF</dt><dd>{cadastro.uf ?? TRACO}</dd>
          <dt className="text-fg-subtle">Profissão</dt><dd>{cadastro.profissao ?? TRACO}</dd>
          <dt className="text-fg-subtle">Nascimento</dt><dd className="tabular-nums">{dataPt(cadastro.dt_nascimento)}</dd>
          <dt className="text-fg-subtle">Rendimentos</dt><dd className="tabular-nums">{cadastro.rendimentos != null ? rCurto(cadastro.rendimentos) : TRACO}</dd>
          <dt className="text-fg-subtle">Patrimônio</dt><dd className="tabular-nums">{cadastro.patrimonio != null ? rCurto(cadastro.patrimonio) : TRACO}</dd>
          {resumo?.assessor_nome && <SoNoCelular rotulo="Assessor">{resumo.assessor_nome}</SoNoCelular>}
          <dt className="text-fg-subtle">{divisao ? 'Origem' : 'Parceiro'}</dt><dd>{resumo?.parceiro ?? 'Direto'}</dd>
          {divisao && (
            <>
              <dt className="text-fg-subtle max-md:flex max-md:items-center max-md:gap-1.5">Parceiros<Dica className="md:hidden" texto={`Parte de cada parceiro em tudo o que o cliente gerar ${corretora === 'BTG' ? 'no' : 'na'} ${CORRETORA_LABEL[corretora]}, em qualquer código nosso`} /></dt>
              <dd>{divisao}</dd>
            </>
          )}
          {resumo?.ativador && (
            <SoNoCelular rotulo={<span className="flex items-center gap-1.5">Campanha de ativação<Dica texto="Atendente da campanha de ativação; não mexe no responsável nem na comissão" /></span>}>{resumo.ativador}</SoNoCelular>
          )}
          <dt className="text-fg-subtle">Grupo de corretagem</dt><dd className={resumo?.grupo_corretagem === 'Bloqueado' ? 'text-loss' : resumo?.grupo_corretagem === 'Não vinculado' ? 'text-warn' : undefined}>{resumo?.grupo_corretagem ?? 'Não informado'}</dd>
        </dl>
        {(resumo?.observacoes || resumo?.motivo_recusa) && (
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-dense">
            {resumo?.observacoes && <p><span className="text-fg-subtle">Observações · </span><span className="whitespace-pre-wrap">{resumo.observacoes}</span></p>}
            {resumo?.motivo_recusa && <p><span className="text-fg-subtle">Motivo da recusa · </span>{resumo.motivo_recusa}</p>}
          </div>
        )}
      </Panel>

      {/* celular: com pendência de verdade este bloco vem antes do cadastro; a ordem dos itens e o
          "N itens em ordem" são de lá (ListaPendencias) */}
      <Panel variant="card" className={avisos ? 'max-md:order-first' : undefined} title="Pendências" subtitle={avisos ? `${avisos} ${avisos === 1 ? 'item' : 'itens'} para resolver` : 'Cadastro completo'}>
        <ListaPendencias itens={pendencias} recolherOk hrefTarifas={hrefAba('contas')} />
      </Panel>

      {/* celular: o Excluir saiu do alto da ficha e fica aqui, no fim; a mesma confirmação */}
      {temListaPropria(corretora) && admin && (
        <div className="md:hidden"><ExcluirClienteButton corretora={corretora} clienteId={id} nome={cadastro.nome} base={base} variante="botao" /></div>
      )}
    </div>
  )
}
