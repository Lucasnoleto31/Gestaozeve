// As opções do campo Origem / parceiro (ficha do lead, ficha de ganho, ficha do cliente e cliente novo):
// os parceiros que recebem do escritório e as origens que já estão escritas nos leads e nas fichas.
// Só servidor. A montagem da lista fica em origens.ts.
import { corretorasDoPerfil, type Corretora } from '@/lib/corretoras'
import { equipeLeads } from './guard'
import { configBtg } from './btg'
import { CHAVE_PARCEIROS_RECEITA, lerParceirosReceita, nomesComRegra } from './participacao'
import { opcoesDeOrigem, type OpcoesOrigem } from './origens'
import type { Parametro } from './tipos'

type Row = Record<string, unknown>
const PAGINA = 10000

// Parceiros = comissionados (Parâmetros › Responsáveis) + quem tem participação na comissão do BTG
// (repasse_parceiros) + quem tem participação na receita (parceiros_receita), nas corretoras que o usuário
// vê (as do perfil, quando não vêm informadas). Uma leitura que falhe não derruba a tela: a lista só fica
// menor (o valor gravado continua aparecendo).
export async function opcoesOrigem(corretorasPedidas?: Corretora[]): Promise<OpcoesOrigem> {
  const { db, profile } = await equipeLeads()
  const corretoras = corretorasPedidas ?? corretorasDoPerfil(profile)
  const [resp, params, leads, fichas] = await Promise.all([
    db.from('responsaveis').select('nome').eq('comissionado', true).eq('ativo', true),
    corretoras.length
      ? db.from('parametros').select('corretora, chave, valor, descricao').in('corretora', corretoras).in('chave', ['repasse_parceiros', CHAVE_PARCEIROS_RECEITA])
      : Promise.resolve({ data: [] as Row[], error: null }),
    db.from('leads').select('origem').not('origem', 'is', null).range(0, PAGINA - 1),
    corretoras.length
      ? db.from('cliente_corretora').select('parceiro').in('corretora', corretoras).not('parceiro', 'is', null).range(0, PAGINA - 1)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ])
  const linhas = (r: { data: unknown; error: unknown }) => (r.error ? [] : ((r.data ?? []) as Row[]))
  const parceiros: string[] = linhas(resp).map(r => String(r.nome ?? ''))
  for (const p of linhas(params)) {
    const valor = String(p.valor ?? '')
    if (p.chave === CHAVE_PARCEIROS_RECEITA) parceiros.push(...nomesComRegra(lerParceirosReceita(valor)))
    else if (p.corretora === 'BTG') parceiros.push(...configBtg([{ chave: 'repasse_parceiros', valor, descricao: null } as Parametro]).parceiros.map(x => x.nome))
  }
  return opcoesDeOrigem(parceiros, [...linhas(leads).map(r => String(r.origem ?? '')), ...linhas(fichas).map(r => String(r.parceiro ?? ''))])
}
