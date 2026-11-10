// Leituras da fila do dia (só servidor). Os leads vêm direto da tabela (poucas colunas); os clientes,
// da clientes_lista de cada corretora que o usuário vê (risco, nível, campanha, contatos); o próximo
// contato (S59) vem das colunas novas — antes da S59 a fila funciona sem ele e avisa.
import { corretorasDoPerfil, type Corretora } from '@/lib/corretoras'
import { fmtDate, hojeBrasil } from '@/lib/periodo'
import { mesmaPessoa } from '@/lib/texto'
import { clientesLista, parametroGeral, responsaveisAtivos, statusLeadLista } from './consultas'
import { equipeLeads, falha, str } from './guard'
import type { ClienteFila, LeadFila } from './fila'

type Row = Record<string, unknown>
type Erro = { code?: string; message: string } | null

export type DadosFila = {
  leads: LeadFila[]
  clientes: ClienteFila[]
  semS59: boolean          // colunas proximo_contato ainda não existem
  restrito: boolean        // atendente: só os próprios leads, sem clientes
  usuario: string
  responsaveis: string[]   // nomes da equipe (filtro "tarefas de")
  diasAlerta: number
  hoje: string
  corretoras: Corretora[]
}

const colunaAusente = (e: Erro) => !!e && (e.code === '42703' || /proximo_contato/i.test(e.message))

// Páginas de 1.000 (limite por chamada da API); devolve o erro em vez de lançar para o chamador decidir
async function lerTudo(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown; error: Erro }>): Promise<{ rows: Row[]; error: Erro }> {
  const out: Row[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) return { rows: out, error }
    const pagina = (data ?? []) as Row[]
    out.push(...pagina)
    if (pagina.length < 1000) break
  }
  return { rows: out, error: null }
}

export async function dadosDaFila(): Promise<DadosFila> {
  const { db, profile, restrito } = await equipeLeads()
  const hoje = fmtDate(hojeBrasil())
  const corretoras = corretorasDoPerfil(profile)
  const [status, responsaveis, diasAlertaTxt] = await Promise.all([statusLeadLista(), responsaveisAtivos(), parametroGeral('dias_alerta_lead', '7')])
  const diasAlerta = Math.max(1, Number(diasAlertaTxt) || 7)
  const abertoPorStatus = new Map(status.map(s => [s.status, s.tipo === 'Aberto']))
  let semS59 = false

  // Leads: as colunas da fila; sem a S59, sem proximo_contato
  const COLS = 'id, nome, whatsapp, responsavel, status, data_hora, ultimo_contato, corretora, origem'
  const consultaLeads = (cols: string) => lerTudo((de, ate) => db.from('leads').select(cols).order('id').range(de, ate))
  let r = await consultaLeads(`${COLS}, proximo_contato`)
  if (r.error && colunaAusente(r.error)) { semS59 = true; r = await consultaLeads(COLS) }
  if (r.error) falha(r.error, 'leads')
  const leads: LeadFila[] = r.rows
    .map(l => {
      const st = String(l.status ?? 'Novo')
      return {
        id: String(l.id), nome: String(l.nome ?? ''), whatsapp: str(l.whatsapp), responsavel: str(l.responsavel), status: st,
        aberto: abertoPorStatus.get(st) ?? !['Ganho', 'Perdido'].includes(st), data_hora: String(l.data_hora),
        ultimo_contato: str(l.ultimo_contato), proximo_contato: str(l.proximo_contato), corretora: str(l.corretora), origem: str(l.origem),
      }
    })
    .filter(l => (l.aberto || l.proximo_contato) && (!restrito || mesmaPessoa(l.responsavel, profile.nome)))

  // Clientes (não para o atendente): risco, campanha e retorno marcado, em cada corretora visível
  let clientes: ClienteFila[] = []
  if (!restrito) {
    const proximos = new Map<string, string>()
    if (!semS59) {
      const { data, error } = await db.from('cliente_corretora').select('cliente_id, corretora, proximo_contato').not('proximo_contato', 'is', null).range(0, 9999)
      if (error) { if (colunaAusente(error)) semS59 = true; else falha(error, 'cliente_corretora') }
      for (const p of (data ?? []) as Row[]) proximos.set(`${p.corretora}:${p.cliente_id}`, String(p.proximo_contato))
    }
    const listas = await Promise.all(corretoras.map(c => clientesLista(c, null)))
    clientes = listas.flatMap((lista, i) => lista.map<ClienteFila>(c => ({
      cliente_id: c.cliente_id, corretora: corretoras[i], nome: c.nome, telefone: c.telefone, responsavel: c.responsavel, ativador: c.ativador,
      situacao: c.situacao, risco: c.risco, nivel: c.nivel, dias_sem_giro: c.dias_sem_giro, lotes_media_3m: c.lotes_media_3m,
      contatos: c.contatos, ultimo_contato: c.ultimo_contato, proximo_contato: proximos.get(`${corretoras[i]}:${c.cliente_id}`) ?? null,
    }))).filter(c => c.risco || c.ativador || c.proximo_contato)
  }

  return {
    leads, clientes, semS59, restrito, usuario: profile.nome, hoje, diasAlerta, corretoras,
    responsaveis: restrito ? responsaveis.filter(x => mesmaPessoa(x.nome, profile.nome)).map(x => x.nome) : responsaveis.map(x => x.nome),
  }
}
