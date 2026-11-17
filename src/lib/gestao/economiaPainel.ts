// O dinheiro de uma corretora no mês, comum ao Painel (abas Resumo e Mês a mês) e ao Início: os parâmetros da corretora, a série mensal e,
// no BTG, a cadeia de repasse (faixas ou o % do fechamento, Delta, imposto, parceiros com participação na
// comissão) mais o que o BTG paga fora dos lotes (fora do giro do fechamento e Banking, gravados em
// Importar). Cada aba chama isto uma vez e pede só as outras consultas que ela mostra.
import { comissaoMensal, painelMensal, parametrosDaCorretora } from './consultas'
import { calcularRepasse, configBtg } from './btg'
import { extrasAplicados, extrasPorMes } from './consultasBanking'
import { livrosComFichas } from './consultasParticipacao'
import { temListaPropria, type Corretora } from '@/lib/corretoras'
import type { PainelMensalRow } from './tipos'

export type Economia = Awaited<ReturnType<typeof economiaDoPainel>>

const JANELA = 12   // meses do Painel

export async function economiaDoPainel(corretora: Corretora, mesRef: string) {
  // a receita mensal da carteira de cada parceiro com participação na comissão vem da mesma consulta das
  // Comissões e começa assim que os parâmetros chegam, em paralelo com o resto
  const parP = parametrosDaCorretora(corretora)
  const livrosP = parP.then(p => Promise.all(configBtg(p.parametros).parceiros.map(async x => ({ nome: x.nome, meses: await comissaoMensal(mesRef, JANELA, x.nome, corretora) }))))
  const [par, mensal, livros, extras] = await Promise.all([
    parP, painelMensal(corretora, mesRef, JANELA), livrosP,
    temListaPropria(corretora) ? extrasAplicados(corretora) : Promise.resolve([]),
  ])
  const cfg = configBtg(par.parametros)
  const atp = cfg.modelo === 'ATP'            // sem incentivo por pontos (BTG)
  const comRepasse = cfg.faixas.length > 0    // a receita passa pela cadeia de repasse
  const mensalPorMes = new Map(mensal.map(m => [m.mes_ref, m]))
  const receitaTotal = (m: PainelMensalRow) => m.receita + (atp ? 0 : m.incentivo)
  // clientes com lista de parceiros na ficha (S61): cada um entra no livro dos parceiros da lista, com o
  // percentual da linha; null enquanto nenhuma ficha tem lista (a conta de sempre)
  const fichas = await livrosComFichas(corretora, cfg.parceiros, Object.fromEntries(livros.map(l => [l.nome, Object.fromEntries(l.meses.map(x => [x.mes_ref, x.receita_carteira]))])), mesRef, JANELA)
  // clientes de parceiros com participação: um livro à parte na cadeia (só os parceiros com receita na janela)
  const receitaParceiros = (mes: string): Record<string, number> => fichas
    ? Object.fromEntries(cfg.parceiros.map(p => [p.nome, fichas[p.nome]?.[mes]?.alocada ?? 0]))
    : Object.fromEntries(livros.map(l => [l.nome, l.meses.find(x => x.mes_ref === mes)?.receita_carteira ?? 0]))
  // o percentual de cada parceiro no mês, quando não é o geral do parâmetro
  const pctParceiros = (mes: string): Record<string, number> | undefined => (fichas ? Object.fromEntries(cfg.parceiros.map(p => [p.nome, fichas[p.nome]?.[mes]?.pct ?? p.pctParceiro])) : undefined)
  const parceirosComReceita = cfg.parceiros.filter(p => fichas
    ? Object.values(fichas[p.nome] ?? {}).some(x => x.alocada > 0)
    : livros.some(l => l.nome === p.nome && l.meses.some(x => x.receita_carteira > 0)))
  // o parceiro leva o percentual geral em todos os meses da janela (sem cliente com percentual próprio na ficha)?
  const pctGeralSempre = (nome: string) => {
    const geral = cfg.parceiros.find(p => p.nome === nome)?.pctParceiro ?? 0
    return !fichas || Object.values(fichas[nome] ?? {}).every(x => x.alocada <= 0 || Math.abs(x.pct - geral) < 1e-9)
  }
  // no mês com percentual registrado (fechamento já recebido) a comissão usa esse percentual; nos outros, as faixas
  const repasseDe = (m: PainelMensalRow) => calcularRepasse(m.receita, cfg, m.mes_ref, receitaParceiros(m.mes_ref), pctParceiros(m.mes_ref))
  const repasseDaReceita = (receita: number, mes: string, parceiros?: Record<string, number>) => calcularRepasse(receita, cfg, mes, parceiros ?? receitaParceiros(mes), pctParceiros(mes))
  // fora dos lotes: cada fonte traz a parte do escritório e o imposto da própria planilha e soma na comissão líquida
  const foraGiro = extrasPorMes(extras, 'fora_giro'), banking = extrasPorMes(extras, 'banking')
  const foraDe = (mes: string) => foraGiro.get(mes)?.total ?? null
  const bankingDe = (mes: string) => banking.get(mes)?.total ?? null
  const extrasDe = (mes: string) => (foraDe(mes)?.liquida ?? 0) + (bankingDe(mes)?.liquida ?? 0)
  const liquidoCom = (mes: string, liquidoGiro: number) => liquidoGiro + extrasDe(mes)
  return {
    par, cfg, atp, comRepasse, mensal, mensalPorMes, receitaTotal, receitaParceiros, parceirosComReceita, pctGeralSempre, repasseDe, repasseDaReceita,
    foraDe, bankingDe, extrasDe, liquidoCom, temFora: foraGiro.size > 0, temBanking: banking.size > 0,
    pctDoFechamento: (mes: string) => cfg.pctMes[mes.slice(0, 7)] != null,
  }
}
