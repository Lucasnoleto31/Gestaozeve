// As abas de quem está na remuneração por níveis (S62): Resumo (o nível, os pontos e a conta do mês) e Extrato
// (cada evento e cada cliente da base que girou, com o valor). Carteira continua a de sempre; Pagamentos e
// regras troca as faixas por conta pela tabela de níveis (RegrasNiveis). Os meses antes da entrada no modelo
// seguem as abas de sempre (comissão por conta).
import Link from 'next/link'
import { comissaoPagamentos } from '@/lib/gestao/consultas'
import { contasDe, geradoAteHoje, pessoaNoModelo, remuneracaoDaEquipe } from '@/lib/gestao/consultasRemuneracao'
import { ROTULO_LINHA, round2, valorNaCorretora, vigente, type LinhaValor } from '@/lib/gestao/remuneracao'
import { DICA_LIQUIDO, DICA_NIVEL, DICA_PONTOS, fraseDoNivel, nomeMes, nomeMesAno, partesDoMes, pctTxt, pontosTxt, pts, reais } from '@/lib/gestao/remuneracaoTexto'
import { janelaMeses, mesCurto, mesLongo, parseMes, somarMeses } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, CORRETORA_SLUG, isCorretora, type Corretora } from '@/lib/corretoras'
import { fmtBRL2, fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Alert } from '@/components/ui/Alert'
import { Dica } from '@/components/ui/Dica'
import { Recolhido } from '@/components/ui/Recolhido'
import { Resumo, semQuebra } from '@/components/gestao/Resumo'
import { LinhaVazia, TRACO, dataCurta, r0, rCurto } from '@/components/gestao/Celulas'
import { TIPO, alemDoLimite, corretoraNome, fonteKpi, hrefComissoes, listaDireita, pagamentosDoFiltro, type FiltroAba } from './comum'
import { PagamentosComissao } from './PagamentosComissao'
import { RegrasNiveis } from './RegrasNiveis'
import { RecolheNoCelular } from '@/components/ui/RecolheNoCelular'
import { MostrarMais } from './MostrarMais'
import { SeloLista } from './SeloLista'

const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
const naCorretora = (c: Corretora | null) => (c ? ` na ${CORRETORA_LABEL[c]}` : '')

function celulaQuantidade(l: LinhaValor, nivel: number) {
  if (l.tipo === 'fixo') return `Nível ${nivel}`
  if (l.tipo === 'bonusCheio' || l.tipo === 'bonusMetade') return l.quantidade ? r0(l.quantidade) : TRACO
  return l.quantidade ? fmtNum(l.quantidade) : TRACO
}
const celulaUnitario = (l: LinhaValor) => (l.tipo === 'bonusCheio' || l.tipo === 'bonusMetade' ? pctTxt(l.unitario) : r0(l.unitario))

// ── Resumo ───────────────────────────────────────────────────────────────────
// fraseNoCelular: como em AbaResumo, false quando a participação já abre a aba pela frase dela
export async function AbaResumoNivel({ parceiro, corretora, mesRef, fraseNoCelular = true }: FiltroAba & { fraseNoCelular?: boolean }) {
  const [r, pagamentos] = await Promise.all([remuneracaoDaEquipe(), comissaoPagamentos(parceiro)])
  const pessoa = pessoaNoModelo(r, parceiro)
  if (!pessoa) return null
  const meses = janelaMeses(mesRef, 12)
  const contas = contasDe(r, pessoa.nome, meses)
  const conta = contas[contas.length - 1]
  const visiveis = pagamentosDoFiltro(pagamentos, corretora)
  const gerado = geradoAteHoje(r, pessoa.nome, corretora)
  const pago = round2(visiveis.reduce((s, p) => s + p.valor, 0))
  const saldo = round2(gerado - pago)
  const p = partesDoMes(conta, corretora)
  const texto = fraseDoNivel({ tabelas: r.config.tabelas, mesCorrente: r.mesFim, nome: pessoa.nome, conta, corretora, rotuloCorretora: corretora ? CORRETORA_LABEL[corretora] : undefined })
  const mes = mesCurto(mesRef)
  const n = conta.nivel
  const pagoNoMes = (m: string) => round2(visiveis.filter(x => parseMes(x.mes_ref) === m).reduce((s, x) => s + x.valor, 0))
  // o mês a mês começa no primeiro mês com algum valor
  const linhas = contas.map(c => ({ c, gerado: valorNaCorretora(c, corretora), pago: pagoNoMes(c.mes) }))
  const primeiro = linhas.findIndex(l => l.gerado || l.pago || (l.c.mes >= r.mesIni && l.c.pontos.total > 0))
  const comDado = primeiro < 0 ? [] : linhas.slice(primeiro)
  const corretoras = Object.entries(conta.valor.porCorretora).filter(([, v]) => v.total)
  // ── Celular (DESIGN.md §8): a frase curta responde "quanto soma no mês, em que nível, quanto falta pagar";
  // os mesmos números dos cartões. A frase do nível (compartilhada com Meus pontos) tem seis números e cinco
  // linhas no celular: lá os fatos dela ficam nos quatro números e a projeção da próxima revisão vem logo abaixo.
  const corrente = conta.mes === r.mesFim
  const fraseCurta = `${pessoa.nome} ${corrente ? 'soma' : 'gerou'} ${p.total ? rCurto(p.total) : 'R$ 0'} em ${nomeMesAno(mesRef, r.mesFim)}${corrente ? ' até agora' : ''}${naCorretora(corretora)}${n ? `, no Nível ${n.nivel}` : ''}. ${
    saldo > 0 ? `O saldo a pagar até hoje é de ${rCurto(saldo)}.` : saldo < 0 ? `Já foram pagos ${rCurto(-saldo)} acima do gerado até hoje.` : 'Tudo o que foi gerado até hoje já foi pago.'}`
  const cartaoSaldo = (classe: string) => (
    <KpiCard className={classe} label="Saldo a pagar" value={saldo ? rCurto(saldo) : 'R$ 0'} tone={saldo < 0 ? 'warn' : 'neutral'} sub={saldo < 0 ? 'pago acima do gerado até hoje' : `gerado ${rCurto(gerado)} menos pago ${pago ? rCurto(pago) : 'R$ 0'}`}
      dica="Tudo o que foi gerado até hoje (a comissão por conta antes do modelo e a conta do nível depois) menos os pagamentos lançados." />
  )
  // a conta do mês no celular: só as linhas com valor; as outras ficam numa linha só, com o preço de cada uma
  const ehBonus = (l: LinhaValor) => l.tipo === 'bonusCheio' || l.tipo === 'bonusMetade'
  const contaDaLinha = (l: LinhaValor) => (l.tipo === 'fixo' ? `Nível ${n?.nivel ?? '–'}`
    : ehBonus(l) ? `${pctTxt(l.unitario)} de ${r0(l.quantidade)} de líquido`
    : l.tipo === 'regraPorConta' ? plural(l.quantidade, 'conta', 'contas')
    : `${fmtNum(l.quantidade)} × ${r0(l.unitario)}`)
  const precoDaLinha = (l: LinhaValor) => (l.tipo === 'fixo' || l.tipo === 'regraPorConta' ? '' : ehBonus(l) ? `, ${pctTxt(l.unitario)} do líquido` : `, ${r0(l.unitario)} cada`)
  const comValor = conta.valor.linhas.filter(l => l.total), semValor = conta.valor.linhas.filter(l => !l.total)

  return (
    <>
      {!r.config.instalado && (
        <Alert tone="warn" title="A tabela de níveis ainda não está no banco">
          Rode a S62 (supabase-s62-remuneracao-niveis.sql) no Supabase. Até lá a conta usa a tabela de 18/11 só neste ambiente.
        </Alert>
      )}
      {fraseNoCelular && <div className="md:hidden"><Resumo frase={fraseCurta} /></div>}
      {texto && <div className="max-md:hidden"><Resumo frase={texto.frase} apoio={texto.apoio} nota={corrente ? 'O mês ainda está correndo: pontos e valor mudam até o último dia lançado.' : undefined} /></div>}

      {/* No celular os dois primeiros ficam como cartão e os outros viram linha: o saldo a pagar sobe para o lado
          do total do mês (cópia só de celular; a do computador segue no fim da faixa, como sempre) */}
      <KpiRow cols={4}>
        <KpiCard destaque label={`Total de ${mes}`} value={p.total ? rCurto(p.total) : 'R$ 0'} sub={`fixo ${rCurto(p.fixo)} + variável ${p.variavel ? rCurto(p.variavel) : 'R$ 0'}`}
          dica="O fixo do nível, cada evento pelo valor do nível (abertura, ativação, reativação e a segunda metade da reativação que segue girando 3 meses depois) e o bônus sobre o líquido da base ativa. Com o filtro de corretora, o fixo entra pela parte dos pontos do mês em cada corretora." />
        {cartaoSaldo('md:hidden')}
        <KpiCard label={`Pontos de ${mes}`} value={pts(conta.pontos.total)}
          sub={`${plural(conta.pontos.ativacoes, 'ativação', 'ativações')} · ${plural(conta.pontos.reativacoes, 'reativação', 'reativações')} · ${pts(conta.pontos.pontosBase)} da base`} dica={DICA_PONTOS} />
        <KpiCard className="max-md:border-b-0!" label="Nível" value={n ? `Nível ${n.nivel}` : TRACO} sub={n ? `até ${mesCurto(somarMeses(n.proximaRevisao, -1))} · média ${pts(n.media)}` : undefined} dica={DICA_NIVEL} />
        {/* com "!": a regra da base que transforma o cartão em linha no celular define o display e venceria */}
        {cartaoSaldo('max-md:hidden!')}
      </KpiRow>

      {/* a segunda linha da frase do nível (o que falta para subir) e o aviso do mês em andamento */}
      {texto && (
        <div className="md:hidden">
          <p className="text-dense text-fg-muted">{semQuebra(texto.apoio)}</p>
          {corrente && <p className="mt-1 text-label text-fg-muted">O mês ainda está correndo: pontos e valor mudam até o último dia lançado.</p>}
        </div>
      )}

      <Panel title={`A conta de ${mesLongo(mesRef)}`} subtitle={<>Pelos valores do Nível {n?.nivel ?? '–'}.<span className="max-md:hidden"> A lista de contas e de clientes da base está no Extrato.</span></>}>
        {/* no celular, uma lista (a tabela de 4 colunas não cabe sem rolar para o lado) */}
        <ul className="divide-y divide-line md:hidden">
          {comValor.map(l => (
            <li key={l.tipo} className="flex items-baseline justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-dense text-fg">{ROTULO_LINHA[l.tipo]}</p>
                <p className="text-label text-fg-muted">{contaDaLinha(l)}</p>
              </div>
              <p className="num shrink-0 text-dense font-medium">{r0(l.total)}</p>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 py-2.5 font-semibold"><span>Total do mês</span><span className="num">{r0(conta.valor.total)}</span></li>
        </ul>
        {semValor.length > 0 && (
          <p className="mt-2 text-label text-fg-muted md:hidden">Ainda sem valor em {mes}: {semValor.map(l => `${ROTULO_LINHA[l.tipo]}${precoDaLinha(l)}`).join(' · ')}.</p>
        )}
        <div className="tbl-wrap hidden md:block">
          <table className="tbl tbl-dense">
            <thead><tr><th scope="col">O que entra</th><th scope="col" className="num">Quantidade</th><th scope="col" className="num">Valor</th><th scope="col" className="num">Total</th></tr></thead>
            <tbody>
              {conta.valor.linhas.map(l => (
                <tr key={l.tipo}>
                  <td className="whitespace-normal">{ROTULO_LINHA[l.tipo]}{(l.tipo === 'bonusCheio' || l.tipo === 'bonusMetade') && <span className="ml-1 text-label text-fg-subtle">sobre o líquido</span>}</td>
                  <td className={cn('num', !l.quantidade && l.tipo !== 'fixo' && 'subtle')}>{celulaQuantidade(l, n?.nivel ?? 0)}</td>
                  <td className="num muted">{celulaUnitario(l)}</td>
                  <td className={cn('num', !l.total && 'subtle')}>{r0(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="total"><td colSpan={3}>Total do mês</td><td className="num">{r0(conta.valor.total)}</td></tr></tfoot>
          </table>
        </div>
        {corretoras.length > 0 && (
          <p className="mt-3 text-label text-fg-subtle max-md:text-fg-muted">
            {/* a regra da divisão está em Pagamentos e regras › Como a conta é feita: no celular ficam só os valores */}
            Por corretora: {corretoras.map(([c, v]) => `${corretoraNome(c)} ${r0(v.total)}`).join(' · ')}.<span className="max-md:hidden"> Eventos e bônus contam onde aconteceram; o fixo se divide pelos pontos do mês em cada corretora.</span>
          </p>
        )}
      </Panel>

      {/* No celular cada mês é uma linha que abre o mês (tbl-lista): o gerado à direita; pontos, nível e o que foi
          pago na linha de apoio. O destaque do mês aberto fica só no computador (a faixa não cabe na linha). */}
      <Panel title="Mês a mês" subtitle={<>Antes da entrada no modelo vale a comissão por conta (“por conta”).<span className="max-md:hidden"> Clique no mês para ver a conta dele.</span></>}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={listaDireita('6.75rem')}>
            <thead><tr><th scope="col">Mês</th><th scope="col" className="num col-p2">Pontos</th><th scope="col">Nível</th><th scope="col" className="num">Gerado</th><th scope="col" className="num">Pago</th></tr></thead>
            <tbody>
              {comDado.length === 0 && <LinhaVazia colunas={5}>Nada gerado nos últimos 12 meses.</LinhaVazia>}
              {[...comDado].reverse().map(({ c, gerado: g, pago: pg }) => (
                <tr key={c.mes} className={cn(c.mes === mesRef && 'md:bg-accent-soft')}>
                  <td className="cel-titulo font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: c.mes })} className="link">{mesLongo(c.mes)}</Link></td>
                  <td className={cn('num col-p2 cel-sub', c.mes < r.mesIni && 'subtle vazio')}>{c.mes >= r.mesIni ? <>{pts(c.pontos.total)}<span className="md:hidden"> {Math.abs(c.pontos.total) < 2 ? 'ponto' : 'pontos'}</span></> : TRACO}</td>
                  <td className={cn('cel-sub whitespace-normal', !c.noModelo && 'muted')}>{c.noModelo && c.nivel ? `Nível ${c.nivel.nivel}` : 'por conta'}</td>
                  <td className={cn('num cel-valor', !g && 'subtle')}><span className={cn(!g && 'max-md:text-fg-subtle')}>{r0(g)}</span></td>
                  <td className={cn('num cel-sub', !pg && 'subtle vazio')} data-rotulo="pago">{r0(pg)}</td>
                </tr>
              ))}
            </tbody>
            {comDado.length > 1 && (
              <tfoot><tr className="total"><td className="cel-titulo">{comDado.length} meses</td><td className="col-p2" /><td /><td className="num cel-valor">{r0(comDado.reduce((s, l) => s + l.gerado, 0))}</td><td className="num cel-sub" data-rotulo="pago">{r0(comDado.reduce((s, l) => s + l.pago, 0))}</td></tr></tfoot>
            )}
          </table>
        </div>
      </Panel>
    </>
  )
}

// ── Extrato ──────────────────────────────────────────────────────────────────
export async function AbaExtratoNivel({ parceiro, corretora, mesRef }: FiltroAba) {
  const r = await remuneracaoDaEquipe()
  const pessoa = pessoaNoModelo(r, parceiro)
  if (!pessoa) return null
  const [conta] = contasDe(r, pessoa.nome, [mesRef])
  const v = conta.valores
  if (!v) return null
  const doFiltro = (c: string) => !corretora || c === corretora
  const eventos = conta.eventos.filter(e => doFiltro(e.corretora))
  const permanencias = conta.permanencias.filter(e => doFiltro(e.corretora))
  const base = conta.base.filter(b => doFiltro(b.corretora))
  const liquido = base.reduce((s, b) => s + b.liquido, 0)
  const bonus = base.reduce((s, b) => s + b.liquido * (b.cheio ? v.bonus1Ano : v.bonusDepois), 0)
  const conta_ = (t: string) => eventos.filter(e => e.tipo === t).length
  const pontoDe = (tipo: string, c: string) => {
    const regua = vigente(r.config.reguas, mesRef)
    if (!regua) return 0
    return tipo === 'ativacao' ? regua.pontosAtivacao[c] ?? 1 : tipo === 'reativacao' ? regua.pontosReativacao : regua.pontosAbertura
  }
  const linhaEventos = [
    ...eventos.map(e => ({ chave: `${e.cliente_id}:${e.corretora}:${e.tipo}:${e.data}`, cliente_id: e.cliente_id, nome: e.nome, corretora: e.corretora, rotulo: TIPO[e.tipo].label, variante: TIPO[e.tipo].variant, data: e.data, pontos: pontoDe(e.tipo, e.corretora), valor: e.valor })),
    ...permanencias.map(e => ({ chave: `p:${e.cliente_id}:${e.corretora}:${e.data}`, cliente_id: e.cliente_id, nome: e.nome, corretora: e.corretora, rotulo: 'Segue girando', variante: 'neutral' as const, data: e.data, pontos: 0, valor: v.reativacao3Meses })),
  ]
  const frase = `Em ${nomeMes(mesRef)}${naCorretora(corretora)}, ${pessoa.nome} teve ${plural(conta_('abertura'), 'conta aberta', 'contas abertas')}, ${plural(conta_('ativacao'), 'ativação', 'ativações')} e ${plural(conta_('reativacao'), 'reativação', 'reativações')}${permanencias.length ? `, mais ${plural(permanencias.length, 'reativação que segue girando', 'reativações que seguem girando')}` : ''}; ${base.length === 1 ? '1 cliente da base girou e deixou' : `${fmtNum(base.length)} clientes da base giraram e deixaram`} ${reais(liquido)} para o escritório.`
  // no computador o nome é cortado na largura da coluna; no celular a linha é um item e o nome aparece inteiro
  const link = (id: string, c: string, nome: string) => (
    <span className="block md:max-w-[15rem] md:truncate" title={nome}>
      {isCorretora(c) ? <Link href={`/${CORRETORA_SLUG[c]}/clientes/${id}`} className="link">{nome}</Link> : nome}
    </span>
  )
  const valoresDoNivel = `Valores do Nível ${conta.nivel?.nivel ?? '–'}: R$ ${fmtNum(v.abertura)} por conta aberta, R$ ${fmtNum(v.ativacao)} por ativação, ${r0(v.reativacaoVolta)} quando o cliente volta e ${r0(v.reativacao3Meses)} se ainda gira 3 meses depois; bônus de ${pctTxt(v.bonus1Ano)} no 1º ano e ${pctTxt(v.bonusDepois)} depois.`
  const totalContas = linhaEventos.reduce((s, e) => s + e.valor, 0), pontosContas = linhaEventos.reduce((s, e) => s + e.pontos, 0)
  // com o filtro de corretora ligado a barra de cima já diz qual é: a corretora só entra na linha sem filtro
  const celCorretora = corretora ? '' : 'cel-sub'

  return (
    <>
      {/* o apoio (a tabela de valores do nível) fica fora do Resumo para poder sair da vista no celular: lá vai
          para "Valores do Nível", um toque abaixo dos dois números */}
      <div>
        <Resumo frase={frase} />
        <p className="mt-1.5 max-w-5xl text-dense text-fg-muted max-md:hidden">{semQuebra(valoresDoNivel)}</p>
      </div>

      {/* Celular: os dois números que respondem à aba (quanto as contas e a base renderam à pessoa), que no
          computador são as linhas de total das duas tabelas */}
      <KpiRow cols={2} className="md:hidden">
        <KpiCard label={`Contas de ${mesLongo(mesRef)}`} value={fmtBRL2(totalContas)} valueClassName={fonteKpi(fmtBRL2(totalContas))}
          sub={`${plural(conta_('abertura'), 'aberta', 'abertas')} · ${plural(conta_('ativacao'), 'ativação', 'ativações')} · ${plural(conta_('reativacao'), 'reativação', 'reativações')}${permanencias.length ? ` · ${plural(permanencias.length, 'segue girando', 'seguem girando')}` : ''}`} />
        <KpiCard label="Bônus da base" value={fmtBRL2(bonus)} valueClassName={fonteKpi(fmtBRL2(bonus))} sub={`${plural(base.length, 'cliente', 'clientes')} · líquido de ${reais(liquido)}`} />
      </KpiRow>
      <Recolhido tamanho="linha" titulo={`Valores do Nível ${conta.nivel?.nivel ?? '–'}`} className="md:hidden">
        <p className="text-dense text-fg-muted">{semQuebra(valoresDoNivel)}</p>
      </Recolhido>

      <Panel title={`Contas de ${mesLongo(mesRef)}`} subtitle={<span className="max-md:hidden">Os eventos do motor de comissões (inclusive a campanha de ativação), pelo valor do nível.</span>}>
        <MostrarMais total={linhaEventos.length}>
        <div className="tbl-wrap max-h-[60vh]">
          <table className="tbl tbl-dense tbl-lista lista-abre">
            <thead><tr><th scope="col">Cliente</th><th scope="col" className="col-p2">Corretora</th><th scope="col" className="col-p2">Evento</th><th scope="col" className="num col-p2">Data</th><th scope="col" className="num col-p3">Pontos</th><th scope="col" className="num">Valor</th></tr></thead>
            <tbody>
              {linhaEventos.length === 0 && <LinhaVazia colunas={6}>Nenhuma conta aberta, ativada ou reativada em {mesLongo(mesRef)}{naCorretora(corretora)}.</LinhaVazia>}
              {linhaEventos.map((e, i) => (
                <tr key={e.chave} className={alemDoLimite(i)}>
                  <td className="cel-titulo font-medium">{link(e.cliente_id, e.corretora, e.nome)}</td>
                  <td className={cn('muted col-p2', celCorretora)}>{corretoraNome(e.corretora)}</td>
                  <td className="col-p2 cel-sub"><SeloLista variante={e.variante}>{e.rotulo}</SeloLista></td>
                  <td className="num col-p2 cel-sub">{dataCurta(e.data)}</td>
                  <td className={cn('num col-p3 cel-sub', !e.pontos && 'subtle vazio')}>{e.pontos ? <>{fmtNum(e.pontos)}<span className="md:hidden"> {e.pontos === 1 ? 'ponto' : 'pontos'}</span></> : TRACO}</td>
                  <td className={cn('num cel-valor', !e.valor && 'subtle')}>{r0(e.valor)}</td>
                </tr>
              ))}
            </tbody>
            {linhaEventos.length > 0 && (
              <tfoot>
                <tr className="total">
                  <td colSpan={4} className="cel-titulo"><span className="max-md:hidden">{plural(linhaEventos.length, 'evento', 'eventos')}</span><span className="md:hidden">Total das contas</span></td>
                  <td className={cn('num col-p3 cel-sub', !pontosContas && 'vazio')}>{fmtNum(pontosContas)}<span className="md:hidden"> {pontosContas === 1 ? 'ponto' : 'pontos'}</span></td>
                  <td className="num cel-valor">{r0(totalContas)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </MostrarMais>
      </Panel>

      <Panel title={<span className="inline-flex items-center gap-1.5">Base ativa de {mesLongo(mesRef)}<Dica texto={DICA_LIQUIDO} /></span>}
        subtitle={<>Os clientes em que a pessoa fez o último movimento (abriu, ativou ou reativou) e que giraram no mês<span className="max-md:hidden">: o líquido de cada um paga o bônus e dá 1 ponto a cada R$ 1.000</span>.</>}>
        <MostrarMais total={base.length}>
        <div className="tbl-wrap max-h-[60vh]">
          <table className="tbl tbl-dense tbl-lista lista-abre" style={listaDireita('6.5rem')}>
            <thead><tr><th scope="col">Cliente</th><th scope="col" className="col-p2">Corretora</th><th scope="col" className="col-p3">Último movimento</th><th scope="col" className="num col-p2">Líquido no mês</th><th scope="col" className="num col-p3">Bônus</th><th scope="col" className="num">Valor</th></tr></thead>
            <tbody>
              {base.length === 0 && <LinhaVazia colunas={6}>Nenhum cliente da base girou em {mesLongo(mesRef)}{naCorretora(corretora)}.</LinhaVazia>}
              {base.map((b, i) => {
                const pct = b.cheio ? v.bonus1Ano : v.bonusDepois
                return (
                  <tr key={`${b.cliente_id}:${b.corretora}`} className={alemDoLimite(i)}>
                    <td className="cel-titulo font-medium">{link(b.cliente_id, b.corretora, b.nome)}</td>
                    <td className={cn('muted col-p2', celCorretora)}>{corretoraNome(b.corretora)}</td>
                    <td className="muted col-p3 cel-sub">{TIPO[b.tipoMovimento].label} em {dataCurta(b.ultimoMovimento)}</td>
                    <td className={cn('num col-p2 cel-sub', b.liquido < 0 && 'text-loss')} data-rotulo={'líquido\u00a0de'}>{r0(b.liquido)}</td>
                    <td className="num col-p3 muted cel-sub" data-rotulo={'bônus\u00a0de'}>{pctTxt(pct)}</td>
                    <td className={cn('num cel-valor', !b.liquido && 'subtle')}>{r0(b.liquido * pct)}</td>
                  </tr>
                )
              })}
            </tbody>
            {base.length > 0 && (
              <tfoot>
                <tr className="total"><td colSpan={3} className="cel-titulo">{plural(base.length, 'cliente', 'clientes')} · {pontosTxt(liquido / (vigente(r.config.reguas, mesRef)?.reaisPorPonto ?? 1000))}</td><td className="num col-p2 cel-sub" data-rotulo={'líquido\u00a0de'}>{r0(liquido)}</td><td className="col-p3" /><td className="num cel-valor">{r0(bonus)}</td></tr>
              </tfoot>
            )}
          </table>
        </div>
        </MostrarMais>
      </Panel>
    </>
  )
}

// ── Pagamentos e regras ──────────────────────────────────────────────────────
export async function AbaPagamentosNivel({ parceiro, admin }: { parceiro: string; admin: boolean }) {
  const [r, pagamentos] = await Promise.all([remuneracaoDaEquipe(), comissaoPagamentos(parceiro)])
  const pessoa = pessoaNoModelo(r, parceiro)
  return (
    <>
      {/* No celular a aba abre pelos pagamentos; as regras (texto corrido) ficam recolhidas, um toque cada */}
      <div className="grid gap-8 max-md:gap-6 xl:grid-cols-2">
        <PagamentosComissao parceiro={parceiro} pagamentos={pagamentos} admin={admin} />
        {/* No computador a moldura do recolhido some (md:contents) e o miolo vira o item da grade; o cartão
            ocupa a altura toda (md:h-full), lado a lado com o de pagamentos e da mesma altura, como antes */}
        <RecolheNoCelular titulo="Como a conta é feita" className="md:contents">
        <Panel variant="card" className="md:h-full" title={<span className="max-md:hidden">Como a conta é feita</span>}>
          <ul className="list-disc space-y-1 pl-5 text-dense text-fg-muted">
            <li><span className="text-fg">Eventos</span>: os do motor de comissões. Abertura é a conta migrada; ativação, a primeira operação em até 60 dias da abertura (na campanha de ativação, a primeira depois da atribuição); reativação, o cliente que volta a girar depois de 4 meses parado.</li>
            <li><span className="text-fg">Base ativa</span>: o cliente é de quem fez o último movimento com ele (abriu, ativou ou reativou). Entram os que giraram no mês.</li>
            <li><span className="text-fg">Nível</span>: revisto a cada 3 meses pela média dos pontos dos 3 meses anteriores. Sobe na revisão em que a média passa do limite; desce só depois de duas revisões seguidas abaixo.</li>
            <li><span className="text-fg">Valor do mês</span>: fixo do nível + cada evento pelo valor do nível + a segunda metade da reativação que segue girando 3 meses depois (só a feita no modelo) + o bônus da base.</li>
            <li><span className="text-fg">Por corretora</span>: eventos e bônus contam onde aconteceram; o fixo se divide pelos pontos do mês em cada corretora (sem pontos, fica na Genial).</li>
            <li>Os pagamentos lançados abatem do saldo, que soma a comissão por conta de antes do modelo e a conta do nível depois.</li>
          </ul>
        </Panel>
        </RecolheNoCelular>
      </div>
      <RegrasNiveis tabelas={r.config.tabelas} reguas={r.config.reguas} pessoa={pessoa} admin={admin} instalado={r.config.instalado} mesAtual={r.mesFim} />
    </>
  )
}
