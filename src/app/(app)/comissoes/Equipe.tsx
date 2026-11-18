// As abas de quem está na remuneração por níveis (S62): Resumo (o nível, os pontos e a conta do mês) e Extrato
// (cada evento e cada cliente da base que girou, com o valor). Carteira continua a de sempre; Pagamentos e
// regras troca as faixas por conta pela tabela de níveis (RegrasNiveis). Os meses antes da entrada no modelo
// seguem as abas de sempre (comissão por conta).
import Link from 'next/link'
import { comissaoPagamentos } from '@/lib/gestao/consultas'
import { contasDe, geradoAteHoje, pessoaNoModelo, remuneracaoDaEquipe } from '@/lib/gestao/consultasRemuneracao'
import { ROTULO_LINHA, round2, valorNaCorretora, vigente, type LinhaValor } from '@/lib/gestao/remuneracao'
import { DICA_LIQUIDO, DICA_NIVEL, DICA_PONTOS, fraseDoNivel, nomeMes, partesDoMes, pctTxt, pontosTxt, pts, reais } from '@/lib/gestao/remuneracaoTexto'
import { janelaMeses, mesCurto, mesLongo, parseMes, somarMeses } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, CORRETORA_SLUG, isCorretora, type Corretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { Dica } from '@/components/ui/Dica'
import { Resumo } from '@/components/gestao/Resumo'
import { LinhaVazia, TRACO, dataCurta, r0, rCurto } from '@/components/gestao/Celulas'
import { TIPO, corretoraNome, hrefComissoes, pagamentosDoFiltro, type FiltroAba } from './comum'
import { PagamentosComissao } from './PagamentosComissao'
import { RegrasNiveis } from './RegrasNiveis'

const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
const naCorretora = (c: Corretora | null) => (c ? ` na ${CORRETORA_LABEL[c]}` : '')

function celulaQuantidade(l: LinhaValor, nivel: number) {
  if (l.tipo === 'fixo') return `Nível ${nivel}`
  if (l.tipo === 'bonusCheio' || l.tipo === 'bonusMetade') return l.quantidade ? r0(l.quantidade) : TRACO
  return l.quantidade ? fmtNum(l.quantidade) : TRACO
}
const celulaUnitario = (l: LinhaValor) => (l.tipo === 'bonusCheio' || l.tipo === 'bonusMetade' ? pctTxt(l.unitario) : r0(l.unitario))

// ── Resumo ───────────────────────────────────────────────────────────────────
export async function AbaResumoNivel({ parceiro, corretora, mesRef }: FiltroAba) {
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

  return (
    <>
      {!r.config.instalado && (
        <Alert tone="warn" title="A tabela de níveis ainda não está no banco">
          Rode a S62 (supabase-s62-remuneracao-niveis.sql) no Supabase. Até lá a conta usa a tabela de 18/11 só neste ambiente.
        </Alert>
      )}
      {texto && <Resumo frase={texto.frase} apoio={texto.apoio} nota={conta.mes === r.mesFim ? 'O mês ainda está correndo: pontos e valor mudam até o último dia lançado.' : undefined} />}

      <KpiRow cols={4}>
        <KpiCard destaque label={`Total de ${mes}`} value={p.total ? rCurto(p.total) : 'R$ 0'} sub={`fixo ${rCurto(p.fixo)} + variável ${p.variavel ? rCurto(p.variavel) : 'R$ 0'}`}
          dica="O fixo do nível, cada evento pelo valor do nível (abertura, ativação, reativação e a segunda metade da reativação que segue girando 3 meses depois) e o bônus sobre o líquido da base ativa. Com o filtro de corretora, o fixo entra pela parte dos pontos do mês em cada corretora." />
        <KpiCard label={`Pontos de ${mes}`} value={pts(conta.pontos.total)}
          sub={`${plural(conta.pontos.ativacoes, 'ativação', 'ativações')} · ${plural(conta.pontos.reativacoes, 'reativação', 'reativações')} · ${pts(conta.pontos.pontosBase)} da base`} dica={DICA_PONTOS} />
        <KpiCard label="Nível" value={n ? `Nível ${n.nivel}` : TRACO} sub={n ? `até ${mesCurto(somarMeses(n.proximaRevisao, -1))} · média ${pts(n.media)}` : undefined} dica={DICA_NIVEL} />
        <KpiCard label="Saldo a pagar" value={saldo ? rCurto(saldo) : 'R$ 0'} tone={saldo < 0 ? 'warn' : 'neutral'} sub={saldo < 0 ? 'pago acima do gerado até hoje' : `gerado ${rCurto(gerado)} menos pago ${pago ? rCurto(pago) : 'R$ 0'}`}
          dica="Tudo o que foi gerado até hoje (a comissão por conta antes do modelo e a conta do nível depois) menos os pagamentos lançados." />
      </KpiRow>

      <Panel title={`A conta de ${mesLongo(mesRef)}`} subtitle={`Pelos valores do Nível ${n?.nivel ?? '–'}. A lista de contas e de clientes da base está no Extrato.`}>
        {/* no celular, uma lista (a tabela de 4 colunas não cabe sem rolar para o lado) */}
        <ul className="divide-y divide-line md:hidden">
          {conta.valor.linhas.map(l => (
            <li key={l.tipo} className="flex items-baseline justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-dense text-fg">{ROTULO_LINHA[l.tipo]}</p>
                <p className="text-label text-fg-subtle">{l.tipo === 'fixo' ? `Nível ${n?.nivel ?? '–'}` : `${celulaQuantidade(l, n?.nivel ?? 0)} × ${celulaUnitario(l)}`}</p>
              </div>
              <p className={cn('num shrink-0 text-dense', !l.total && 'text-fg-subtle')}>{r0(l.total)}</p>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 py-2 font-semibold"><span>Total do mês</span><span className="num">{r0(conta.valor.total)}</span></li>
        </ul>
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
          <p className="mt-3 text-label text-fg-subtle">
            Por corretora: {corretoras.map(([c, v]) => `${corretoraNome(c)} ${r0(v.total)}`).join(' · ')}. Eventos e bônus contam onde aconteceram; o fixo se divide pelos pontos do mês em cada corretora.
          </p>
        )}
      </Panel>

      <Panel title="Mês a mês" subtitle="Antes da entrada no modelo vale a comissão por conta (“por conta”). Clique no mês para ver a conta dele.">
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead><tr><th scope="col">Mês</th><th scope="col" className="num col-p2">Pontos</th><th scope="col">Nível</th><th scope="col" className="num">Gerado</th><th scope="col" className="num">Pago</th></tr></thead>
            <tbody>
              {comDado.length === 0 && <LinhaVazia colunas={5}>Nada gerado nos últimos 12 meses.</LinhaVazia>}
              {[...comDado].reverse().map(({ c, gerado: g, pago: pg }) => (
                <tr key={c.mes} className={cn(c.mes === mesRef && 'bg-accent-soft')}>
                  <td className="font-medium"><Link href={hrefComissoes({ parceiro, corretora, mes: c.mes })} className="link">{mesLongo(c.mes)}</Link></td>
                  <td className={cn('num col-p2', c.mes < r.mesIni && 'subtle')}>{c.mes >= r.mesIni ? pts(c.pontos.total) : TRACO}</td>
                  <td className={cn('whitespace-normal', !c.noModelo && 'muted')}>{c.noModelo && c.nivel ? `Nível ${c.nivel.nivel}` : 'por conta'}</td>
                  <td className={cn('num', !g && 'subtle')}>{r0(g)}</td>
                  <td className={cn('num', !pg && 'subtle')}>{r0(pg)}</td>
                </tr>
              ))}
            </tbody>
            {comDado.length > 1 && (
              <tfoot><tr className="total"><td>{comDado.length} meses</td><td className="col-p2" /><td /><td className="num">{r0(comDado.reduce((s, l) => s + l.gerado, 0))}</td><td className="num">{r0(comDado.reduce((s, l) => s + l.pago, 0))}</td></tr></tfoot>
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
  // nome do cliente cortado na largura: no celular a tabela não pode rolar para o lado
  const link = (id: string, c: string, nome: string) => (
    <span className="block max-w-[8.5rem] truncate sm:max-w-[15rem]" title={nome}>
      {isCorretora(c) ? <Link href={`/${CORRETORA_SLUG[c]}/clientes/${id}`} className="link">{nome}</Link> : nome}
    </span>
  )

  return (
    <>
      <Resumo frase={frase} apoio={`Valores do Nível ${conta.nivel?.nivel ?? '–'}: R$ ${fmtNum(v.abertura)} por conta aberta, R$ ${fmtNum(v.ativacao)} por ativação, ${r0(v.reativacaoVolta)} quando o cliente volta e ${r0(v.reativacao3Meses)} se ainda gira 3 meses depois; bônus de ${pctTxt(v.bonus1Ano)} no 1º ano e ${pctTxt(v.bonusDepois)} depois.`} />

      <Panel title={`Contas de ${mesLongo(mesRef)}`} subtitle="Os eventos do motor de comissões (inclusive a campanha de ativação), pelo valor do nível.">
        <div className="tbl-wrap max-h-[60vh]">
          <table className="tbl tbl-dense">
            <thead><tr><th scope="col">Cliente</th><th scope="col" className="col-p2">Corretora</th><th scope="col" className="col-p2">Evento</th><th scope="col" className="num col-p2">Data</th><th scope="col" className="num col-p3">Pontos</th><th scope="col" className="num">Valor</th></tr></thead>
            <tbody>
              {linhaEventos.length === 0 && <LinhaVazia colunas={6}>Nenhuma conta aberta, ativada ou reativada em {mesLongo(mesRef)}{naCorretora(corretora)}.</LinhaVazia>}
              {linhaEventos.map(e => (
                <tr key={e.chave}>
                  <td className="font-medium">
                    {link(e.cliente_id, e.corretora, e.nome)}
                    <span className="block text-label font-normal text-fg-subtle md:hidden">{e.rotulo} · {dataCurta(e.data)}</span>
                  </td>
                  <td className="muted col-p2">{corretoraNome(e.corretora)}</td>
                  <td className="col-p2"><Badge variant={e.variante}>{e.rotulo}</Badge></td>
                  <td className="num col-p2">{dataCurta(e.data)}</td>
                  <td className={cn('num col-p3', !e.pontos && 'subtle')}>{e.pontos ? fmtNum(e.pontos) : TRACO}</td>
                  <td className={cn('num', !e.valor && 'subtle')}>{r0(e.valor)}</td>
                </tr>
              ))}
            </tbody>
            {linhaEventos.length > 0 && (
              <tfoot><tr className="total"><td colSpan={4}>{plural(linhaEventos.length, 'evento', 'eventos')}</td><td className="num col-p3">{fmtNum(linhaEventos.reduce((s, e) => s + e.pontos, 0))}</td><td className="num">{r0(linhaEventos.reduce((s, e) => s + e.valor, 0))}</td></tr></tfoot>
            )}
          </table>
        </div>
      </Panel>

      <Panel title={<span className="inline-flex items-center gap-1.5">Base ativa de {mesLongo(mesRef)}<Dica texto={DICA_LIQUIDO} /></span>}
        subtitle="Os clientes em que a pessoa fez o último movimento (abriu, ativou ou reativou) e que giraram no mês: o líquido de cada um paga o bônus e dá 1 ponto a cada R$ 1.000.">
        <div className="tbl-wrap max-h-[60vh]">
          <table className="tbl tbl-dense">
            <thead><tr><th scope="col">Cliente</th><th scope="col" className="col-p2">Corretora</th><th scope="col" className="col-p3">Último movimento</th><th scope="col" className="num col-p2">Líquido no mês</th><th scope="col" className="num col-p3">Bônus</th><th scope="col" className="num">Valor</th></tr></thead>
            <tbody>
              {base.length === 0 && <LinhaVazia colunas={6}>Nenhum cliente da base girou em {mesLongo(mesRef)}{naCorretora(corretora)}.</LinhaVazia>}
              {base.map(b => {
                const pct = b.cheio ? v.bonus1Ano : v.bonusDepois
                return (
                  <tr key={`${b.cliente_id}:${b.corretora}`}>
                    <td className="font-medium">
                      {link(b.cliente_id, b.corretora, b.nome)}
                      <span className="block text-label font-normal text-fg-subtle md:hidden">{r0(b.liquido)} de líquido · {pctTxt(pct)}</span>
                    </td>
                    <td className="muted col-p2">{corretoraNome(b.corretora)}</td>
                    <td className="muted col-p3">{TIPO[b.tipoMovimento].label} em {dataCurta(b.ultimoMovimento)}</td>
                    <td className={cn('num col-p2', b.liquido < 0 && 'text-loss')}>{r0(b.liquido)}</td>
                    <td className="num col-p3 muted">{pctTxt(pct)}</td>
                    <td className={cn('num', !b.liquido && 'subtle')}>{r0(b.liquido * pct)}</td>
                  </tr>
                )
              })}
            </tbody>
            {base.length > 0 && (
              <tfoot><tr className="total"><td colSpan={3}>{plural(base.length, 'cliente', 'clientes')} · {pontosTxt(liquido / (vigente(r.config.reguas, mesRef)?.reaisPorPonto ?? 1000))}</td><td className="num col-p2">{r0(liquido)}</td><td className="col-p3" /><td className="num">{r0(bonus)}</td></tr></tfoot>
            )}
          </table>
        </div>
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
      <div className="grid gap-8 xl:grid-cols-2">
        <PagamentosComissao parceiro={parceiro} pagamentos={pagamentos} admin={admin} />
        <Panel variant="card" title="Como a conta é feita">
          <ul className="list-disc space-y-1 pl-5 text-dense text-fg-muted">
            <li><span className="text-fg">Eventos</span>: os do motor de comissões. Abertura é a conta migrada; ativação, a primeira operação em até 60 dias da abertura (na campanha de ativação, a primeira depois da atribuição); reativação, o cliente que volta a girar depois de 4 meses parado.</li>
            <li><span className="text-fg">Base ativa</span>: o cliente é de quem fez o último movimento com ele (abriu, ativou ou reativou). Entram os que giraram no mês.</li>
            <li><span className="text-fg">Nível</span>: revisto a cada 3 meses pela média dos pontos dos 3 meses anteriores. Sobe na revisão em que a média passa do limite; desce só depois de duas revisões seguidas abaixo.</li>
            <li><span className="text-fg">Valor do mês</span>: fixo do nível + cada evento pelo valor do nível + a segunda metade da reativação que segue girando 3 meses depois (só a feita no modelo) + o bônus da base.</li>
            <li><span className="text-fg">Por corretora</span>: eventos e bônus contam onde aconteceram; o fixo se divide pelos pontos do mês em cada corretora (sem pontos, fica na Genial).</li>
            <li>Os pagamentos lançados abatem do saldo, que soma a comissão por conta de antes do modelo e a conta do nível depois.</li>
          </ul>
        </Panel>
      </div>
      <RegrasNiveis tabelas={r.config.tabelas} reguas={r.config.reguas} pessoa={pessoa} admin={admin} instalado={r.config.instalado} mesAtual={r.mesFim} />
    </>
  )
}
