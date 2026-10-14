import { describe, expect, it } from 'vitest'
import { CHAVES_FILTRO_CLIENTES, CHAVES_FILTRO_LEADS, comEscolhido, filtrosIniciais, lerCookie, lerFiltros, limiteDe, opcaoValida, serializarFiltros } from './filtrosLista'

const PADROES = { busca: '', status: '', risco: '', ordem: 'lotes_12m:desc' }

// O que o servidor recebe: o navegador grava encodeURIComponent(qs) e o cookies() do Next decodifica uma vez
const peloServidor = (qs: string) => decodeURIComponent(encodeURIComponent(qs))
// O que o navegador lê: document.cookie com o valor ainda codificado
const peloNavegador = (nome: string, qs: string) => lerCookie(`outro=1; ${nome}=${encodeURIComponent(qs)}; mais=2`, nome)

describe('filtros das listas', () => {
  it('serializa só o que foi escolhido e difere do padrão', () => {
    expect(serializarFiltros({ busca: ' vitor ', status: 'Migrado', risco: '', ordem: 'lotes_12m:desc' }, PADROES)).toBe('busca=vitor&status=Migrado')
    expect(serializarFiltros({ busca: '', status: '', risco: '', ordem: 'nome:asc' }, PADROES)).toBe('ordem=nome%3Aasc')
    expect(serializarFiltros({ outra: 'x' }, PADROES)).toBe('')
  })
  it('ida e volta pelo cookie sem estragar &, +, %, acento e emoji', () => {
    for (const busca of ['Silva & Filhos', '+55 11 98733-8596', 'C&A Modas 50%', 'joão da silva', 'a+b=c', '😀 "aspas"']) {
      const qs = serializarFiltros({ busca, status: 'Migrado' }, { busca: '', status: '' })
      expect(lerFiltros(peloServidor(qs), CHAVES_FILTRO_CLIENTES), busca).toEqual({ busca, status: 'Migrado' })
      expect(lerFiltros(peloNavegador('zf_clientes_genial', qs), CHAVES_FILTRO_CLIENTES), busca).toEqual({ busca, status: 'Migrado' })
    }
  })
  it('só chaves conhecidas; cookie ausente ou estranho não quebra', () => {
    expect(lerFiltros('status=Migrado&hack=1', CHAVES_FILTRO_CLIENTES)).toEqual({ status: 'Migrado' })
    expect(lerFiltros(undefined, CHAVES_FILTRO_CLIENTES)).toEqual({})
    expect(lerCookie('a=1; b=2', 'zf_leads')).toBeNull()
    expect(lerCookie('zf_leads=%E0%A4%A', 'zf_leads')).toBe('%E0%A4%A')
  })
  it('o endereço manda; sem filtro no endereço (só ?mes=) vale o cookie', () => {
    const cookie = peloServidor('status=Migrado&risco=qualquer')
    expect(filtrosIniciais({ risco: 'parou', mes: '2026-09' }, cookie, CHAVES_FILTRO_CLIENTES)).toEqual({ risco: 'parou' })
    expect(filtrosIniciais({ mes: '2026-09' }, cookie, CHAVES_FILTRO_CLIENTES)).toEqual({ status: 'Migrado', risco: 'qualquer' })
    expect(filtrosIniciais({}, '', CHAVES_FILTRO_CLIENTES)).toEqual({})
  })
  it('leads: mês, alerta e linhas à mostra também voltam', () => {
    expect(filtrosIniciais({}, peloServidor('mes=2026-10&alerta=1&responsavel=Aikon&n=300'), CHAVES_FILTRO_LEADS)).toEqual({ mes: '2026-10', alerta: '1', responsavel: 'Aikon', n: '300' })
  })
  it('linhas à mostra de 100 em 100, entre 100 e 5.000', () => {
    expect(limiteDe(undefined)).toBe(100)
    expect(limiteDe('abc')).toBe(100)
    expect(limiteDe('300')).toBe(300)
    expect(limiteDe('250')).toBe(300)
    expect(limiteDe('999999')).toBe(5000)
  })
  it('valor de lista fixa que não existe vira vazio; valor tirado dos dados continua como opção', () => {
    expect(opcaoValida('Migrado', ['Migrado', 'Recusou'])).toBe('Migrado')
    expect(opcaoValida('hack', ['Migrado'])).toBe('')
    expect(comEscolhido(['sem telefone'], 'migrado sem data')).toEqual(['sem telefone', 'migrado sem data'])
    expect(comEscolhido(['sem telefone'], 'qualquer', ['qualquer'])).toEqual(['sem telefone'])
    expect(comEscolhido(['Aikon'], '')).toEqual(['Aikon'])
  })
})
