// Mensagem do giro do dia para o WhatsApp, montada depois de cada subida da planilha de lotes
// (e sob demanda no Giro diário). Só funções puras: quem lê o banco é acoesGiro.ts.
import { fmtBRL, fmtNum } from '@/lib/format'
import { somarDias } from './meses'

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const diaSemanaCurto = (iso: string) => DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()]
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// Hora que a equipe põe no nome do arquivo ("Lotes 05-11-2026 parcial 12h20.xlsx" → '12h20';
// "… parcial 14h.xlsx" → '14h'; aceita também 13:40). null quando o nome não traz hora.
export function horaDoNome(nome: string | null | undefined): string | null {
  if (!nome) return null
  const h = /(?<![\d:])(\d{1,2})\s*h\s*(\d{2})?(?!\d)/i.exec(nome)
  const m = h ? { hora: Number(h[1]), min: h[2] } : (() => { const x = /(?<![\d:])(\d{1,2}):(\d{2})(?!\d)/.exec(nome); return x ? { hora: Number(x[1]), min: x[2] } : null })()
  if (!m || m.hora > 23 || (m.min != null && Number(m.min) > 59)) return null
  return `${m.hora}h${m.min ?? ''}`
}

// Hora de Brasília de um instante, 'HH:MM'
export const horaBrasil = (instante: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(instante)

// Em que ponto do dia a planilha foi tirada: 'parcial 12h20' (hora no nome do arquivo),
// 'parcial, subida às 14:02' (sem hora no nome, dentro do pregão), 'dia completo' (subida depois
// das 18h30) ou null quando o dia já passou (arquivo de um dia anterior: o giro está fechado).
export function momentoDaSubida(nomeArquivo: string | null | undefined, dia: string, hoje: string, agora: Date): string | null {
  if (dia < hoje) return null
  const hora = horaDoNome(nomeArquivo)
  if (hora) return `parcial ${hora}`
  const hhmm = horaBrasil(agora)
  return hhmm >= '18:30' ? 'dia completo' : `parcial, subida às ${hhmm}`
}

export type GiroParaMensagem = {
  corretora: string                 // 'BTG'
  dia: string                       // 'YYYY-MM-DD'
  momento: string | null            // momentoDaSubida
  lotes: number
  zerados: number
  clientes: number                  // contas que operaram
  receita: number                   // lotes × tarifa + zeragem (a receita do controle)
  ontem: { dia: string; lotes: number; receita: number } | null    // último dia com giro antes deste
  mes: { lotes: number; receita: number; ate: string } | null      // acumulado do mês até o último dia lançado
}

// O texto da mensagem (formatação do WhatsApp: *negrito*)
export function mensagemGiro(g: GiroParaMensagem): string {
  const linhas = [
    `*Giro ${g.corretora} · ${diaSemanaCurto(g.dia)} ${ddmm(g.dia)}*${g.momento ? ` · ${g.momento}` : ''}`,
    `Lotes: ${fmtNum(g.lotes)}${g.zerados ? ` (${fmtNum(g.zerados)} zerados)` : ''} · ${fmtNum(g.clientes)} ${g.clientes === 1 ? 'conta' : 'contas'}`,
    `Receita: ${fmtBRL(g.receita)}`,
  ]
  if (g.ontem) {
    const rotulo = g.ontem.dia === somarDias(g.dia, -1) ? 'Ontem' : 'Último giro'
    linhas.push(`${rotulo} (${diaSemanaCurto(g.ontem.dia)} ${ddmm(g.ontem.dia)}): ${fmtNum(g.ontem.lotes)} lotes · ${fmtBRL(g.ontem.receita)}`)
  }
  if (g.mes) linhas.push(`Mês até ${ddmm(g.mes.ate)}: ${fmtNum(g.mes.lotes)} lotes · ${fmtBRL(g.mes.receita)}`)
  return linhas.join('\n')
}

// Abre o WhatsApp (app ou web) com o texto pronto; quem envia escolhe o grupo ou o contato
export const linkWhatsApp = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`
