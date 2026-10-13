import { describe, expect, it } from 'vitest'
import { casaBusca, casaTelefone, digitosTelefone, indexarBusca, lerBusca } from './busca'

// Lead como vem do formulário e cliente como vem do export da corretora (telefone com 55)
const lead = indexarBusca({ textos: ['Vitor Gomes Miranda', 'Retornar dia 12/10, aporte de R$ 5.000'], telefones: ['(11) 98733-8596'], documentos: ['084.386.906-29'], emails: ['vigmiranda@gmail.com'] })
const cliente = indexarBusca({ textos: ['JOÃO DA SILVA PAZ', 'ZEVE INVESTIMENTOS 18'], telefones: ['5562998765432'], documentos: ['00312345664'], contas: ['002757672', '24394040'], emails: ['joao.paz@hotmail.com'] })
const busca = (termo: string, ix = lead) => casaBusca(lerBusca(termo), ix)

describe('busca por telefone', () => {
  it('acha o lead em qualquer formato de telefone', () => {
    for (const t of ['(11) 98733-8596', '11987338596', '+55 11 98733-8596', '5511987338596', '11 98733 8596', '98733-8596', '987338596', '8596', '011 98733-8596', '0xx11 98733-8596', '0 21 11 98733-8596'])
      expect(busca(t), t).toBe(true)
  })
  it('acha o número colado do WhatsApp ou dos Contatos (caracteres invisíveis, hífens especiais)', () => {
    for (const t of ['‪+55 11 98733-8596‬', '‭(11) 98733-8596‬', '‎+55 11 98733-8596', '11 98733-8596​', '+55 11 98733‑8596', '98733–8596', '+55 11 98733-8596', '‭11987338596‬'])
      expect(busca(t), JSON.stringify(t)).toBe(true)
  })
  it('acha o cliente gravado com o 55 do país, inclusive enquanto digita', () => {
    for (const t of ['(62) 99876-5432', '62998765432', '+55 (62) 99876-5432', '99876-5432', '5562', '556299', '+55 62 99876', '+55 62 99876-54'])
      expect(busca(t, cliente), t).toBe(true)
    for (const t of ['+55 11 98733', '+55 11 98733-85']) expect(busca(t), t).toBe(true)
  })
  it('acha o mesmo número com ou sem o 9 na frente', () => {
    const antigo = indexarBusca({ telefones: ['(11) 8733-8596'] })
    expect(busca('(11) 98733-8596', antigo)).toBe(true)
    expect(busca('98733-8596', antigo)).toBe(true)
    expect(busca('(11) 8733-8596', lead)).toBe(true)
  })
  it('não confunde DDD diferente, outro número nem pedaço curto demais', () => {
    expect(busca('(21) 98733-8596')).toBe(false)
    expect(busca('(11) 98733-0000')).toBe(false)
    expect(casaTelefone(digitosTelefone('(11) 98733-8596'), '596')).toBe(false)
    expect(casaTelefone(digitosTelefone('(11) 98733-8596'), '')).toBe(false)
  })
})

describe('busca por CPF, conta e e-mail', () => {
  it('CPF com ou sem pontuação, inteiro, pedaço ou com rótulo', () => {
    for (const t of ['084.386.906-29', '08438690629', '084.386', '38690629', 'CPF 084.386.906-29', 'cpf: 084.386.906-29', '‪084.386.906-29‬']) expect(busca(t), t).toBe(true)
    expect(busca('999.999.999-99')).toBe(false)
  })
  it('CNPJ com barra', () => {
    const pj = indexarBusca({ documentos: ['12345678000190'] })
    expect(busca('12.345.678/0001-90', pj)).toBe(true)
  })
  it('conta com ou sem zeros à esquerda, com dígito ou a segunda conta', () => {
    for (const t of ['2757672', '002757672', '2439404-0', '24394040']) expect(busca(t, cliente), t).toBe(true)
  })
  it('e-mail inteiro, pedaço, maiúsculas, com < > ou mailto', () => {
    for (const t of ['vigmiranda@gmail.com', 'VIGMIRANDA@GMAIL.COM', 'vigmiranda', '@gmail', '<vigmiranda@gmail.com>', 'vigmiranda@gmail.com;', 'mailto:vigmiranda@gmail.com', 'Vitor <vigmiranda@gmail.com>']) expect(busca(t), t).toBe(true)
    expect(busca('joao.paz', cliente)).toBe(true)
    expect(busca('outro@gmail.com')).toBe(false)
  })
})

describe('busca por nome', () => {
  it('sem acento, sem maiúsculas, palavras em qualquer ordem, pontuação nas pontas', () => {
    for (const t of ['vitor', 'VITOR GOMES', 'vitor miranda', 'miranda vitor', 'Vítor Mirânda', 'Miranda, Vitor', '"vitor miranda"', 'vitor miranda.']) expect(busca(t), t).toBe(true)
    expect(busca('joao paz', cliente)).toBe(true)
    expect(busca('vitor souza')).toBe(false)
  })
  it('apóstrofo reto, curvo ou nenhum', () => {
    const davila = indexarBusca({ textos: ["MARIA D'ÁVILA SOUZA"] })
    for (const t of ["d'avila", 'd’avila', 'davila', "maria d'ávila"]) expect(busca(t, davila), t).toBe(true)
  })
  it('nome e número juntos, inclusive telefone com +55 ou separado por traço', () => {
    for (const t of ['vitor 8596', 'vitor +55 11 98733-8596', 'vitor 55 11 98733-8596', 'Vitor Miranda - (11) 98733-8596', 'vitor (011) 98733-8596']) expect(busca(t), t).toBe(true)
    expect(busca('joao +55 62 99876-5432', cliente)).toBe(true)
    expect(busca('vitor 0000')).toBe(false)
    expect(busca('investimentos 18', cliente)).toBe(true)
  })
  it('datas e valores das observações continuam achando; número puro não casa em texto', () => {
    for (const t of ['12/10', 'dia 12/10', 'R$ 5.000', '5.000']) expect(busca(t), t).toBe(true)
    const obs = indexarBusca({ textos: ['Cliente', 'contato em 2026'], telefones: ['(11) 98733-8596'] })
    expect(busca('2026', obs)).toBe(false)
    expect(busca('18', cliente)).toBe(true)   // número curto acha o assessor ZEVE INVESTIMENTOS 18
  })
  it('ª e º do nome ou das observações, como estão gravados', () => {
    const me = indexarBusca({ textos: ['Mª Eduarda Souza', 'Ligar no 3º andar, 1º contato feito'] })
    for (const t of ['Mª Eduarda', 'Mª', '3º andar', '1º contato']) expect(busca(t, me), t).toBe(true)
  })
  it('data procura só no texto, não em CPF ou telefone', () => {
    const cpf510 = indexarBusca({ textos: ['Fulano'], documentos: ['12351078901'], telefones: ['(11) 95101-0000'] })
    expect(busca('5/10', cpf510)).toBe(false)
    expect(busca('12/10')).toBe(true)
  })
  it('xx dentro de e-mail ou nome não vira 0', () => {
    const xx = indexarBusca({ textos: ['Ana'], emails: ['ana.xx2020@gmail.com'] })
    for (const t of ['ana.xx2020@gmail.com', 'ana.xx2020']) expect(busca(t, xx), t).toBe(true)
  })
  it('parênteses em volta de nome ou e-mail e rótulo colado no número', () => {
    for (const t of ['(Vitor)', 'Vitor Miranda (vigmiranda@gmail.com)', '(vigmiranda@gmail.com)', '("Vitor")', 'CPF:084.386.906-29', 'cpf.08438690629', 'tel:11987338596', 'Tel:(11)98733-8596']) expect(busca(t), t).toBe(true)
    expect(busca('nº2757672', cliente)).toBe(true)
    expect(busca('n° 2757672', cliente)).toBe(true)
  })
  it('telefone gravado sem DDD é achado pelo número com DDD ou +55', () => {
    const semDdd = indexarBusca({ textos: ['Joana Silva'], telefones: ['98733-8596'] })
    const antigo = indexarBusca({ textos: ['Joana Silva'], telefones: ['8733-8596'] })
    for (const t of ['(11) 98733-8596', '+55 11 98733-8596', 'joana 11 98733-8596']) expect(busca(t, semDdd), t).toBe(true)
    for (const t of ['(11) 98733-8596', '11 8733-8596']) expect(busca(t, antigo), t).toBe(true)
  })
  it('mês/ano e CNPJ escritos na observação', () => {
    const obs = indexarBusca({ textos: ['Fulano', 'Retornar em 10/2026, vencimento CDB 03/2027. Empresa CNPJ 12.345.678/0001-90'], documentos: ['08438690629'] })
    for (const t of ['10/2026', '03/2027', '12.345.678/0001-90']) expect(busca(t, obs), t).toBe(true)
  })
  it('rótulo composto, entre parênteses, com 0xx ou colado no e-mail', () => {
    for (const t of ['CPF/CNPJ: 084.386.906-29', 'CPF/CNPJ:084.386.906-29', 'Celular/WhatsApp: (11) 98733-8596', 'Tel/Cel: 11987338596', '(CPF:084.386.906-29)', '"tel:11987338596"', 'tel:0xx11 98733-8596', 'E-mail:vigmiranda@gmail.com', 'cpf08438690629'])
      expect(busca(t), t).toBe(true)
  })
  it('palavra com número sem separador continua texto (pedaço de e-mail)', () => {
    const em = indexarBusca({ textos: ['Beltrano'], emails: ['conta2020@empresa.com.br', 'n1990@uol.com.br'] })
    for (const t of ['conta2020', 'n1990']) expect(busca(t, em), t).toBe(true)
  })
  it('nome em letras estilizadas e hífen pequeno', () => {
    for (const t of ['𝐕𝐢𝐭𝐨𝐫', '𝑽𝒊𝒕𝒐𝒓 𝑴𝒊𝒓𝒂𝒏𝒅𝒂', '(11) 98733﹣8596']) expect(busca(t), t).toBe(true)
  })
  it('DDD 55 completo não casa com outro número que termina igual', () => {
    const rs = indexarBusca({ telefones: ['(55) 98733-8596'] })
    expect(busca('(55) 98733-8596', rs)).toBe(true)
    expect(busca('(55) 98733-8596')).toBe(false)   // o lead é (11) 98733-8596
    expect(busca('+55 11 98733')).toBe(true)
  })
  it('regex do nome para o banco: termo inteiro, especiais escapados, apóstrofo opcional', async () => {
    const { regexDoTexto } = await import('./busca')
    const [tk] = lerBusca('davila')!.tokens
    const re = new RegExp(regexDoTexto(tk)!, 'i')
    expect(re.test("MARIA D'AVILA")).toBe(true)
    expect(re.test('MARIA DAVILA')).toBe(true)
    const [hifen] = lerBusca('joao-pedro')!.tokens
    expect(new RegExp(regexDoTexto(hifen)!, 'i').test('JOAO-PEDRO SILVA')).toBe(true)
    const [ma] = lerBusca('Mª')!.tokens
    expect(new RegExp(regexDoTexto(ma)!, 'i').test('Mª EDUARDA')).toBe(true)
    expect(new RegExp(regexDoTexto(ma)!, 'i').test('MARIA EDUARDA')).toBe(false)
  })
  it('sem termo, tudo aparece', () => {
    expect(lerBusca('   ')).toBeNull()
    expect(lerBusca(' - | ')).toBeNull()
    expect(casaBusca(null, lead)).toBe(true)
  })
})
