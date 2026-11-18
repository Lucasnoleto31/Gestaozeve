'use server'

// Grava a tabela de níveis, a régua de pontos e quem está no modelo de remuneração por níveis (S62), editados em
// Comissões › Pagamentos e regras. Só o admin. A conta fica em remuneracao.ts; as leituras, em consultasRemuneracao.ts.
import { revalidatePath } from 'next/cache'
import { falha, somenteAdmin } from './guard'
import { parseMes } from './meses'
import type { Resultado } from './tipos'

const SEM_S62 = 'A tabela de níveis ainda não existe no banco: rode a S62 (supabase-s62-remuneracao-niveis.sql) no Supabase.'
const semTabela = (e: { code?: string; message: string } | null) => !!e && (['PGRST205', 'PGRST204', '42P01', '42703'].includes(e.code ?? '') || /does not exist|could not find/i.test(e.message))

export type NivelForm = {
  nivel: number; pontosMin: number; fixo: number; abertura: number; ativacao: number
  reativacaoVolta: number; reativacao3Meses: number; bonus1AnoPct: number; bonusDepoisPct: number   // bônus em % (5 = 5 %)
}

const valido = (v: number, max = 1e7) => Number.isFinite(v) && v >= 0 && v <= max

// Uma tabela nova vale a partir do mês escolhido; os meses anteriores seguem a tabela de antes
export async function salvarTabelaNiveis(vigenciaIn: string, niveis: NivelForm[]): Promise<Resultado<{ vigencia: string }>> {
  try {
    const { db } = await somenteAdmin()
    const vigencia = parseMes(vigenciaIn)
    if (!vigencia) throw new Error('Escolha o mês em que a tabela passa a valer.')
    if (niveis.length < 1 || niveis.length > 9) throw new Error('A tabela precisa ter de 1 a 9 níveis.')
    const ordem = [...niveis].sort((a, b) => a.nivel - b.nivel)
    ordem.forEach((n, i) => {
      if (n.nivel !== i + 1) throw new Error('Os níveis precisam ser 1, 2, 3… sem pular.')
      const nums = [n.pontosMin, n.fixo, n.abertura, n.ativacao, n.reativacaoVolta, n.reativacao3Meses]
      if (!nums.every(v => valido(v)) || !valido(n.bonus1AnoPct, 100) || !valido(n.bonusDepoisPct, 100)) throw new Error(`Nível ${n.nivel}: use números a partir de zero (bônus até 100 %).`)
      if (i === 0 && n.pontosMin !== 0) throw new Error('O Nível 1 começa em 0 ponto.')
      if (i > 0 && n.pontosMin <= ordem[i - 1].pontosMin) throw new Error(`Nível ${n.nivel}: os pontos precisam ser maiores que os do Nível ${n.nivel - 1}.`)
    })
    const linhas = ordem.map(n => ({
      vigencia, nivel: n.nivel, pontos_min: n.pontosMin, fixo: n.fixo, abertura: n.abertura, ativacao: n.ativacao,
      reativacao_volta: n.reativacaoVolta, reativacao_3meses: n.reativacao3Meses, bonus_1ano: n.bonus1AnoPct / 100, bonus_depois: n.bonusDepoisPct / 100,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await db.from('remuneracao_niveis').upsert(linhas, { onConflict: 'vigencia,nivel' })
    if (error) { if (semTabela(error)) throw new Error(SEM_S62); falha(error, 'remuneracao_niveis') }
    const { error: e2 } = await db.from('remuneracao_niveis').delete().eq('vigencia', vigencia).gt('nivel', ordem.length)
    if (e2) falha(e2, 'remuneracao_niveis')
    revalidatePath('/comissoes')
    return { ok: true, dados: { vigencia } }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}

export type ReguaForm = {
  pontosAtivacaoGenial: number; pontosAtivacaoBtg: number; pontosReativacao: number; reaisPorPonto: number
  genialRetencaoPct: number; genialPisCofinsPct: number; genialIrPct: number; genialPlataformaLote: number
}

export async function salvarRegua(vigenciaIn: string, f: ReguaForm): Promise<Resultado<{ vigencia: string }>> {
  try {
    const { db } = await somenteAdmin()
    const vigencia = parseMes(vigenciaIn)
    if (!vigencia) throw new Error('Escolha o mês em que a régua passa a valer.')
    if (![f.pontosAtivacaoGenial, f.pontosAtivacaoBtg, f.pontosReativacao, f.genialPlataformaLote].every(v => valido(v, 1000))) throw new Error('Pontos e plataforma: números a partir de zero.')
    if (!(f.reaisPorPonto > 0)) throw new Error('O líquido que vale 1 ponto precisa ser maior que zero.')
    if (![f.genialRetencaoPct, f.genialPisCofinsPct, f.genialIrPct].every(v => valido(v, 100))) throw new Error('Percentuais da Genial: de 0 a 100.')
    const { error } = await db.from('remuneracao_regua').upsert({
      vigencia, pontos_ativacao_genial: f.pontosAtivacaoGenial, pontos_ativacao_btg: f.pontosAtivacaoBtg, pontos_ativacao_xp: f.pontosAtivacaoGenial,
      pontos_reativacao: f.pontosReativacao, reais_por_ponto: f.reaisPorPonto, genial_retencao_pct: f.genialRetencaoPct, genial_pis_cofins_pct: f.genialPisCofinsPct,
      genial_ir_pct: f.genialIrPct, genial_plataforma_lote: f.genialPlataformaLote, updated_at: new Date().toISOString(),
    }, { onConflict: 'vigencia' })
    if (error) { if (semTabela(error)) throw new Error(SEM_S62); falha(error, 'remuneracao_regua') }
    revalidatePath('/comissoes')
    return { ok: true, dados: { vigencia } }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}

// Põe ou tira uma pessoa do modelo. nivelDesde vazio = fora do modelo (volta a comissão por conta);
// trabalhaDesde = primeiro mês trabalhado (os meses antes dele não entram na média de pontos)
export async function salvarPessoaNoModelo(nome: string, nivelDesdeIn: string, trabalhaDesdeIn: string): Promise<Resultado<null>> {
  try {
    const { db } = await somenteAdmin()
    const nivelDesde = nivelDesdeIn.trim() ? parseMes(nivelDesdeIn) : null
    const trabalhaDesde = trabalhaDesdeIn.trim() ? parseMes(trabalhaDesdeIn) : null
    if (nivelDesdeIn.trim() && !nivelDesde) throw new Error('Mês de entrada no modelo inválido.')
    if (trabalhaDesdeIn.trim() && !trabalhaDesde) throw new Error('Mês de início do trabalho inválido.')
    if (nivelDesde && trabalhaDesde && trabalhaDesde > nivelDesde) throw new Error('O início do trabalho não pode ser depois da entrada no modelo.')
    const { data, error } = await db.from('responsaveis').update({ nivel_desde: nivelDesde, trabalha_desde: trabalhaDesde }).eq('nome', nome).select('nome')
    if (error) { if (semTabela(error)) throw new Error(SEM_S62); falha(error, 'responsaveis') }
    if (!data?.length) throw new Error(`${nome} não está em Parâmetros › Responsáveis.`)
    revalidatePath('/comissoes')
    return { ok: true, dados: null }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}
