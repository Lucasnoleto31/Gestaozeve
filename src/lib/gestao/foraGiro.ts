// Produtos fora do giro do fechamento principal do BTG ("Artur Fonseca_<mês>.xlsx"): CDB, saldo remunerado
// digital, aluguel, fundos, cripto… O BTG paga comissão sobre eles, mas não são lotes: a receita do sistema
// (lotes × tarifa + zeragem) não os vê. Lucas, 16/11/2026: "lança" também esses produtos nas receitas.
//
// A própria planilha diz quanto fica para o escritório: o quadro depois das linhas tem, por produto, a
// "Soma de Comissão" e a "Comissão <assessor>" (50 % nos bancários e nos fundos, 70 % no aluguel, que é
// renda variável, em out/26) e a "Alíquota de Imposto 16,5%". Sem o quadro vale a regra: renda variável
// fica com o que sobra da Delta, o resto com 50 %, e o imposto do parâmetro.
// Cliente de parceiro com participação na comissão (repasse_parceiros, pela ficha) segue a divisão do
// parceiro, como a aba dele: imposto, a parte do parceiro e, do restante, a parte do escritório.
// O mês fica guardado como o Banking (banking.ts), em detalhes.fora_giro. Só funções puras.
import { corrigirMojibake, normTexto } from '@/lib/texto'
import { numeroBR } from './planilhas'
import { PRODUTOS_RV, type AbaPlanilha, type LinhaFechamento } from './fechamento'
import type { ParceiroRepasse } from './btg'
import { gruposDasLinhas, somarBanking, type GrupoBanking, type ItemBanking, type PercentualGrupo, type TotaisBanking } from './banking'

export const PCT_FORA_GIRO_PADRAO = 50   // parte do escritório quando a planilha não traz o quadro (produtos que não são renda variável)

// O quadro de resumo da aba do escritório: % do escritório por produto (em maiúsculas) e o imposto
export type QuadroFechamento = { pctPorProduto: Record<string, number>; impostoPct: number | null }

const r6 = (n: number) => Math.round(n * 1e6) / 1e6
const norm = (v: unknown) => corrigirMojibake(String(v ?? '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Lê "Rótulos de Linha | Soma de Receita Líquida | Soma de Comissão | Comissão <assessor>" e a alíquota
export function lerQuadroFechamento(abas: AbaPlanilha[]): QuadroFechamento {
  const out: QuadroFechamento = { pctPorProduto: {}, impostoPct: null }
  for (const aba of abas) {
    let cols: { rotulo: number; comissao: number; parte: number } | null = null
    for (const row of aba.linhas) {
      if (!Array.isArray(row)) continue
      const hs = row.map(norm)
      if (!cols) {
        const rotulo = hs.indexOf('rotulos de linha'), comissao = hs.findIndex(h => h.startsWith('soma de comissao'))
        const parte = hs.findIndex((h, j) => j !== comissao && h.startsWith('comissao ') && !h.startsWith('comissao total') && !h.startsWith('comissao liquida'))
        if (rotulo >= 0 && comissao >= 0 && parte >= 0) cols = { rotulo, comissao, parte }
        continue
      }
      const rotulo = hs[cols.rotulo] ?? ''
      if (rotulo.includes('imposto')) {
        const pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(String(row[cols.rotulo] ?? ''))
        if (pct) out.impostoPct = numeroBR(pct[1])
        continue
      }
      if (!rotulo || rotulo.startsWith('comissao')) continue   // "Comissão Total", "Comissão líquida"…
      const comissao = numero(row[cols.comissao]), parte = numero(row[cols.parte])
      // só as linhas de produto têm a parte do escritório (as de categoria ficam em branco)
      if (comissao != null && parte != null && comissao > 0) out.pctPorProduto[String(row[cols.rotulo]).trim().toUpperCase()] = r6((parte / comissao) * 100)
    }
    if (cols) break   // o quadro fica na aba do escritório
  }
  return out
}

export type ContextoForaGiro = {
  contaParaCliente: Map<string, string>   // conta sem zeros à esquerda → cliente
  parceiroDoCliente: Map<string, string>  // cliente → parceiro da ficha
  parceiros: ParceiroRepasse[]            // parceiros com participação na comissão (repasse_parceiros)
  deltaPct: number                        // Delta sobre a comissão de renda variável (o escritório fica com o resto)
  impostoPct: number                      // imposto do escritório (parâmetro)
  quadro: QuadroFechamento
}
export type ForaDoGiro = { itens: ItemBanking[]; percentuais: PercentualGrupo[]; grupos: GrupoBanking[]; total: TotaisBanking; repasse: number; avisos: string[] }

const semZeros = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '')

// As linhas fora do giro do mês viram grupos por produto (e por parceiro, quando o cliente é de um), cada
// um com a parte do escritório e o imposto. `repasse` é o que cabe aos parceiros nesses produtos.
export function foraDoGiro(linhas: LinhaFechamento[], mes: string, ctx: ContextoForaGiro): ForaDoGiro {
  const avisos: string[] = []
  const percentuais = new Map<string, PercentualGrupo>()
  const itens: ItemBanking[] = []
  const semQuadro = new Set<string>()
  const imposto = ctx.quadro.impostoPct ?? ctx.impostoPct
  for (const l of linhas) {
    if (PRODUTOS_RV.includes(l.produto) || l.data.slice(0, 7) !== mes.slice(0, 7)) continue
    const cliente = ctx.contaParaCliente.get(l.conta_sz || semZeros(l.conta))
    const tag = cliente ? ctx.parceiroDoCliente.get(cliente) : undefined
    const parceiro = tag ? ctx.parceiros.find(p => normTexto(p.nome) === normTexto(tag)) : undefined
    const produto = l.produto || l.categoria || 'SEM PRODUTO'
    const grupo = parceiro ? `${produto} · ${parceiro.nome}` : produto
    if (!percentuais.has(grupo)) {
      if (parceiro) {
        percentuais.set(grupo, { grupo, pctEscritorio: r6(((100 - parceiro.pctParceiro) * parceiro.pctEscritorio) / 100), impostoPct: ctx.impostoPct, parceiro: parceiro.nome, pctParceiro: parceiro.pctParceiro })
      } else {
        let pct = ctx.quadro.pctPorProduto[produto]
        if (pct == null) { pct = norm(l.categoria) === 'renda variavel' ? 100 - ctx.deltaPct : PCT_FORA_GIRO_PADRAO; semQuadro.add(produto) }
        percentuais.set(grupo, { grupo, pctEscritorio: r6(pct), impostoPct: imposto })
      }
    }
    itens.push({ grupo, data: l.data, conta: l.conta, cliente: l.cliente, categoria: l.categoria, produto: l.produto, ativo: l.ativo, tipo: l.tipo, bruta: r6(l.bruta), liquida: r6(l.liquida), comissao: r6(l.comissao) })
  }
  if (semQuadro.size) avisos.push(`A planilha não traz a parte do escritório de ${[...semQuadro].sort().join(', ')}: usei ${100 - ctx.deltaPct} % para renda variável e ${PCT_FORA_GIRO_PADRAO} % para os demais.`)
  if (itens.length && ctx.quadro.impostoPct == null) avisos.push(`A planilha não traz a alíquota de imposto: usei ${imposto.toLocaleString('pt-BR')} % (Parâmetros).`)
  const grupos = gruposDasLinhas(itens, [...percentuais.values()]).sort((a, b) => b.liquida - a.liquida || a.grupo.localeCompare(b.grupo, 'pt-BR'))
  return { itens, percentuais: grupos.map(g => percentuais.get(g.grupo)!), grupos, total: somarBanking(grupos, itens), repasse: r6(grupos.reduce((s, g) => s + (g.parteParceiro ?? 0), 0)), avisos }
}
