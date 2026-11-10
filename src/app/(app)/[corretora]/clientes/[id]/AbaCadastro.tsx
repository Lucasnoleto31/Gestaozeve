// Ficha do cliente › Cadastro: os dados do cadastro e o que falta completar
import { Panel } from '@/components/ui/Panel'
import { TRACO, dataPt, rCurto } from '@/components/gestao/Celulas'
import { ListaPendencias, type Ficha, type Pendencia } from './comum'

export function AbaCadastro({ ficha, pendencias }: { ficha: Ficha; pendencias: Pendencia[] }) {
  const { resumo, cadastro } = ficha
  if (!cadastro) return null
  const avisos = pendencias.filter(p => p.estado === 'warn').length

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel variant="card" title="Cadastro" subtitle="Dados do export da corretora e os campos manuais da ficha.">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-dense">
          <dt className="text-fg-subtle">Tipo</dt><dd>{cadastro.tipo_pessoa ?? TRACO}</dd>
          <dt className="text-fg-subtle">Perfil</dt><dd>{cadastro.perfil ?? TRACO}{cadastro.perfil_suitability ? ` · ${cadastro.perfil_suitability}` : ''}</dd>
          <dt className="text-fg-subtle">UF</dt><dd>{cadastro.uf ?? TRACO}</dd>
          <dt className="text-fg-subtle">Profissão</dt><dd>{cadastro.profissao ?? TRACO}</dd>
          <dt className="text-fg-subtle">Nascimento</dt><dd className="tabular-nums">{dataPt(cadastro.dt_nascimento)}</dd>
          <dt className="text-fg-subtle">Rendimentos</dt><dd className="tabular-nums">{cadastro.rendimentos != null ? rCurto(cadastro.rendimentos) : TRACO}</dd>
          <dt className="text-fg-subtle">Patrimônio</dt><dd className="tabular-nums">{cadastro.patrimonio != null ? rCurto(cadastro.patrimonio) : TRACO}</dd>
          <dt className="text-fg-subtle">Parceiro</dt><dd>{resumo?.parceiro ?? 'Direto'}</dd>
          <dt className="text-fg-subtle">Grupo de corretagem</dt><dd className={resumo?.grupo_corretagem === 'Bloqueado' ? 'text-loss' : resumo?.grupo_corretagem === 'Não vinculado' ? 'text-warn' : undefined}>{resumo?.grupo_corretagem ?? 'Não informado'}</dd>
        </dl>
        {(resumo?.observacoes || resumo?.motivo_recusa) && (
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-dense">
            {resumo?.observacoes && <p><span className="text-fg-subtle">Observações · </span><span className="whitespace-pre-wrap">{resumo.observacoes}</span></p>}
            {resumo?.motivo_recusa && <p><span className="text-fg-subtle">Motivo da recusa · </span>{resumo.motivo_recusa}</p>}
          </div>
        )}
      </Panel>

      <Panel variant="card" title="Pendências" subtitle={avisos ? `${avisos} ${avisos === 1 ? 'item' : 'itens'} para resolver` : 'Cadastro completo'}>
        <ListaPendencias itens={pendencias} />
      </Panel>
    </div>
  )
}
