// Leitura do giro dos clientes nas outras corretoras (só servidor). Usa os lotes por cliente e mês
// (painel_clientes_mensal, sobre a tabela-resumo lotes_mes): poucas centenas de linhas por corretora,
// bem mais leve que a lista completa de clientes de lá.
import { CORRETORAS, podeVerCorretora, type Corretora } from '@/lib/corretoras'
import { painelClientesMensal } from './consultas'
import { juntarGiroFora, resumirGiroFora, type GiroFora } from './giroFora'
import { equipe } from './guard'

// Meses lidos de cada corretora: o de referência e os dois anteriores
const MESES = 3

// Por cliente, o giro dele nas outras corretoras que o usuário pode ver (só quem tem lotes lá na janela)
export async function giroNasOutrasCorretoras(atual: Corretora): Promise<Map<string, GiroFora>> {
  const { profile } = await equipe()
  const outras = CORRETORAS.filter(c => c !== atual && podeVerCorretora(profile, c))
  const mapas = await Promise.all(outras.map(async c => resumirGiroFora(c, await painelClientesMensal(c, null, MESES))))
  return juntarGiroFora(mapas)
}
