'use server'

// Resumo do giro de um dia (lotes, zerados, contas, receita, dia anterior e mês) no formato da
// mensagem de WhatsApp: a Importação chama depois de cada subida da planilha e o Giro diário sob demanda.
import { corretoraValida, equipe } from './guard'
import { diario, painelKpis } from './consultas'
import { CORRETORA_LABEL } from '@/lib/corretoras'
import { ehIso, limitesDoMes, somarDias } from './meses'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { mensagemGiro, momentoDaSubida } from './mensagens'
import type { Resultado } from './tipos'

export type ResumoGiro = { texto: string; dia: string; lotes: number; receita: number }

export async function resumoGiroDoDia(corretoraIn: string, dia: string, nomeArquivo?: string | null): Promise<Resultado<ResumoGiro>> {
  try {
    const corretora = await corretoraValida(corretoraIn)
    await equipe()
    if (!ehIso(dia)) throw new Error('Dia inválido')
    const hoje = fmtDate(hojeBrasil())
    const mes = `${dia.slice(0, 7)}-01`
    const [serie, kpis] = await Promise.all([diario(corretora, somarDias(dia, -14), dia), painelKpis(corretora, mes)])
    const doDia = serie.find(d => d.dia === dia)
    if (!doDia) throw new Error(`Sem lotes lançados em ${dia.slice(8, 10)}/${dia.slice(5, 7)}`)
    const ontem = [...serie].reverse().find(d => d.dia < dia) ?? null
    const fimMes = limitesDoMes(mes).fim
    const ate = kpis?.ultima_data && kpis.ultima_data <= fimMes ? kpis.ultima_data : dia
    const texto = mensagemGiro({
      corretora: CORRETORA_LABEL[corretora], dia, momento: momentoDaSubida(nomeArquivo, dia, hoje, new Date()),
      lotes: doDia.lotes, zerados: doDia.zerados, clientes: doDia.clientes, receita: doDia.receita,
      ontem: ontem ? { dia: ontem.dia, lotes: ontem.lotes, receita: ontem.receita } : null,
      mes: kpis ? { lotes: kpis.lotes_mes, receita: kpis.receita_mes, ate } : null,
    })
    return { ok: true, dados: { texto, dia, lotes: doDia.lotes, receita: doDia.receita } }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Erro inesperado' }
  }
}
