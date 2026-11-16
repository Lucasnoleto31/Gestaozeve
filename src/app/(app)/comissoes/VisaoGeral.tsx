// Visão geral das comissões: uma linha por comissionado com o que gerou no mês, o que já foi pago e o
// saldo, e quem tem participação na receita: em corretagem, zeragem e incentivo dos clientes dele
// (parceiros_receita) ou na comissão do BTG (repasse_parceiros, a aba própria do fechamento), as duas com
// gerado, pago e saldo. É a porta de entrada da tela: "quanto devo a cada um?". Cada parceiro tem uma conta
// só: quem aparece em mais de um bloco tem o pago e o saldo no primeiro, com tudo o que gerou somado.
// As origens do campo Parceiro da ficha não aparecem: não recebem.
import Link from 'next/link'
import { comissaoItens, comissaoMensal, comissaoPagamentos } from '@/lib/gestao/consultas'
import { participacaoReceita, regrasDoParceiroPorCorretora, repasseBtgDeTodos, type RegrasCorretora } from '@/lib/gestao/consultasParticipacao'
import { nomesComRegra, resumirReceita } from '@/lib/gestao/participacao'
import { resumirComissao } from '@/lib/gestao/comissao'
import { mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import type { ParceiroComissao } from '@/lib/gestao/comissao'
import { normTexto } from '@/lib/texto'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { LinhaVazia, TRACO, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { hrefComissoes, pagamentosDoFiltro, round2 } from './comum'

// Parceiro com participação na comissão do BTG: a parte dele no mês e a posição até hoje
type Btg = { nome: string; receita: number; comissao: number; mes: number; previa: boolean; gerado: number; pago: number; pagoMes: number; saldo: number }
// Parceiro com participação em corretagem, zeragem e incentivo: as partes dele no mês e a posição até hoje
type Receita = { nome: string; corretoras: Corretora[]; corretagem: number; zeragem: number; incentivo: number; mes: number; gerado: number; pago: number; pagoMes: number; saldo: number }

// Um por parceiro com regra em parceiros_receita (já dentro do filtro de corretora). Aqui uma falha não
// esconde o bloco: é dinheiro a pagar, melhor a tela avisar do erro do que somar a menos.
async function participacoesReceita(regras: RegrasCorretora[], corretora: Corretora | null, mesRef: string): Promise<Receita[]> {
  return Promise.all(nomesComRegra(regras.flatMap(r => r.regras)).map(async nome => {
    const dele = regrasDoParceiroPorCorretora(regras, nome)
    const [livros, pagamentos] = await Promise.all([Promise.all(dele.map(r => participacaoReceita(r.corretora, r.regras, nome))), comissaoPagamentos(nome)])
    const visiveis = pagamentosDoFiltro(pagamentos, corretora)
    const res = resumirReceita(livros, mesRef)
    const pago = visiveis.reduce((s, p) => s + p.valor, 0)
    return {
      nome, corretoras: dele.map(r => r.corretora), corretagem: res.mes.parteCorretagem, zeragem: res.mes.parteZeragem, incentivo: res.mes.parteIncentivo,
      mes: res.mes.total, gerado: res.gerado, pago, pagoMes: visiveis.filter(x => parseMes(x.mes_ref) === mesRef).reduce((s, x) => s + x.valor, 0), saldo: round2(res.gerado - pago),
    }
  }))
}

// Parceiros com participação na comissão do BTG (parâmetro repasse_parceiros): a parte deles mês a mês, com
// a mesma conta do Painel, e os pagamentos. Como na participação na receita, uma falha aqui aparece na tela:
// é dinheiro a pagar. `desdeDe` = primeiro mês que conta para cada um (quem também tem regra em
// parceiros_receita só conta o BTG a partir do início dela).
async function participacoesBtg(corretora: Corretora | null, mesRef: string, desdeDe: (nome: string) => string | null): Promise<Btg[]> {
  const livros = await repasseBtgDeTodos(desdeDe)
  return Promise.all(livros.map(async l => {
    const visiveis = pagamentosDoFiltro(await comissaoPagamentos(l.regra.nome), corretora)
    const doMes = l.meses.find(m => m.mes === mesRef)
    const gerado = round2(l.meses.reduce((s, m) => s + m.parte, 0))
    const pago = visiveis.reduce((s, p) => s + p.valor, 0)
    return {
      nome: l.regra.nome, receita: doMes?.receita ?? 0, comissao: doMes?.comissao ?? 0, mes: doMes?.parte ?? 0, previa: !!doMes && !doMes.fechado,
      gerado, pago, pagoMes: visiveis.filter(x => parseMes(x.mes_ref) === mesRef).reduce((s, x) => s + x.valor, 0), saldo: round2(gerado - pago),
    }
  }))
}

// regras = as de participação na receita dentro do filtro de corretora; regrasTodas = sem o filtro (para saber
// desde quando cada parceiro tem participação, o que limita o começo da conta dele no BTG)
export async function VisaoGeral({ parceiros, corretora, mesRef, verBtg, regras = [], regrasTodas = regras }: {
  parceiros: ParceiroComissao[]; corretora: Corretora | null; mesRef: string; verBtg: boolean; regras?: RegrasCorretora[]; regrasTodas?: RegrasCorretora[]
}) {
  const comissionados = parceiros.filter(p => p.comissionado)
  const inicioDaReceita = (nome: string) => regrasDoParceiroPorCorretora(regrasTodas, nome).flatMap(r => r.regras.map(x => x.desde)).sort()[0] ?? null
  const [porConta, btg, receitas] = await Promise.all([
    Promise.all(comissionados.map(async p => {
      const [itens, pagamentos, mensal] = await Promise.all([comissaoItens(p.nome, corretora), comissaoPagamentos(p.nome), comissaoMensal(mesRef, 1, p.nome, corretora)])
      const visiveis = pagamentosDoFiltro(pagamentos, corretora)
      const r = resumirComissao(itens, mensal, visiveis, mesRef, () => 0)
      return { nome: p.nome, ...r, pagoMes: visiveis.filter(x => parseMes(x.mes_ref) === mesRef).reduce((s, x) => s + x.valor, 0) }
    })),
    verBtg && (!corretora || corretora === 'BTG') ? participacoesBtg(corretora, mesRef, inicioDaReceita) : Promise.resolve([] as Btg[]),
    participacoesReceita(regras, corretora, mesRef),
  ])
  // Cada parceiro tem uma conta só, na primeira linha em que aparece (comissionado, depois participação na
  // receita, depois BTG): os pagamentos dele abatem nela, então o que gerou nos outros blocos entra no gerado
  // e no saldo dessa linha, e as outras linhas dele ficam sem pago e sem saldo.
  const mesmo = (a: string, b: string) => normTexto(a) === normTexto(b)
  const comissionado = (nome: string) => porConta.some(l => mesmo(l.nome, nome))
  const receitaDe = (nome: string) => receitas.find(r => mesmo(r.nome, nome))
  const btgDe = (nome: string) => btg.find(b => mesmo(b.nome, nome))
  const linhas = porConta.map(l => {
    const extra = round2((receitaDe(l.nome)?.gerado ?? 0) + (btgDe(l.nome)?.gerado ?? 0))
    return extra ? { ...l, geradoTotal: round2(l.geradoTotal + extra), saldo: round2(l.saldo + extra) } : l
  })
  const linhasReceita = receitas.map(r => {
    const junto = comissionado(r.nome)
    const doBtg = junto ? 0 : btgDe(r.nome)?.gerado ?? 0
    return { ...r, junto, doBtg, gerado: round2(r.gerado + doBtg), saldo: round2(r.saldo + doBtg) }
  })
  const linhasBtg = btg.map(b => ({ ...b, junto: comissionado(b.nome) ? 'Comissionados' : receitaDe(b.nome) ? 'Participação na receita' : null }))
  // as linhas que carregam o pago e o saldo de cada parceiro, uma por parceiro
  const contas = [...linhas, ...linhasReceita.filter(r => !r.junto), ...linhasBtg.filter(b => !b.junto)]
  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0)
  const comissaoMes = soma(l => l.comissaoMes), saldo = soma(l => l.saldo)
  const receitaMes = round2(receitas.reduce((s, r) => s + r.mes, 0) + btg.reduce((s, b) => s + b.mes, 0))
  const pagoMes = contas.reduce((s, c) => s + c.pagoMes, 0)
  // quem tem a receber não é compensado por quem recebeu a mais: são pessoas diferentes
  const aPagar = contas.reduce((s, c) => s + Math.max(0, c.saldo), 0)
  const adiantado = contas.reduce((s, c) => s + Math.max(0, -c.saldo), 0)
  const temParticipacao = receitas.length > 0 || btg.length > 0
  const previaBtg = btg.some(b => b.previa)
  const eventos = soma(l => l.abertasMes + l.ativacoesMes + l.reativadasMes)
  const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
  const reais = (v: number) => (v ? rCurto(v) : 'R$ 0')
  const mes = mesCurto(mesRef)
  const abrir = (nome: string, aba?: string) => hrefComissoes({ parceiro: nome, corretora, mes: mesRef, aba })

  return (
    <>
      <KpiRow cols={4}>
        {temParticipacao
          ? <KpiCard destaque label={`Gerado em ${mes}`} value={reais(comissaoMes + receitaMes)} sub={`${reais(comissaoMes)} de comissão por conta · ${reais(receitaMes)} de participação na receita`} />
          : <KpiCard destaque label={`Comissão de ${mes}`} value={rCurto(comissaoMes)} sub={`${fmtNum(comissionados.length)} ${comissionados.length === 1 ? 'comissionado' : 'comissionados'} · abertura, ativação e reativação`} />}
        <KpiCard label="A pagar" value={reais(aPagar)} sub={adiantado ? `gerado menos pago · ${rCurto(adiantado)} já pagos a mais a outro parceiro` : 'tudo o que foi gerado menos o que já foi pago'} />
        <KpiCard label={`Pago referente a ${mes}`} value={reais(pagoMes)} sub="pagamentos lançados com este mês de referência" />
        <KpiCard label={`Eventos de ${mes}`} value={fmtNum(eventos)} sub={`${plural(soma(l => l.abertasMes), 'aberta', 'abertas')} · ${plural(soma(l => l.ativacoesMes), 'ativada', 'ativadas')} · ${plural(soma(l => l.reativadasMes), 'reativada', 'reativadas')}`} />
      </KpiRow>

      <Panel title="Comissionados" subtitle={`O que cada um gerou em ${mesLongo(mesRef)} e a posição até hoje. Clique no nome para ver as contas, o extrato, os pagamentos e as regras.`}>
        <div className="tbl-wrap">
          <table className="tbl tbl-dense">
            <thead>
              <tr>
                <th>Parceiro</th><th className="num col-p2">Abertas</th><th className="num col-p2">Ativadas</th><th className="num col-p2">Reativadas</th>
                <th className="num">Comissão de {mes}</th><th className="num col-p3">Gerado até hoje</th><th className="num col-p3">Pago até hoje</th><th className="num">Saldo a pagar</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <LinhaVazia colunas={8}>Ninguém marcado como comissionado. Marque em Parâmetros › Responsáveis (coluna Comissão).</LinhaVazia>}
              {linhas.map(l => (
                <tr key={l.nome}>
                  <td className="font-medium"><Link href={abrir(l.nome)} className="link">{l.nome}</Link></td>
                  <td className={cn('num col-p2', !l.abertasMes && 'subtle')}>{n0(l.abertasMes)}</td>
                  <td className={cn('num col-p2', !l.ativacoesMes && 'subtle')}>{n0(l.ativacoesMes)}</td>
                  <td className={cn('num col-p2', !l.reativadasMes && 'subtle')}>{n0(l.reativadasMes)}</td>
                  <td className={cn('num font-semibold', !l.comissaoMes && 'subtle')}>{r0(l.comissaoMes)}</td>
                  <td className="num col-p3">{r0(l.geradoTotal)}</td>
                  <td className="num col-p3">{r0(l.pago)}</td>
                  <td className={cn('num font-semibold', l.saldo < 0 ? 'text-warn' : !l.saldo && 'subtle')}>{r0(l.saldo)}</td>
                </tr>
              ))}
            </tbody>
            {linhas.length > 1 && (
              <tfoot>
                <tr className="total">
                  <td>Total</td>
                  <td className="num col-p2">{n0(soma(l => l.abertasMes))}</td>
                  <td className="num col-p2">{n0(soma(l => l.ativacoesMes))}</td>
                  <td className="num col-p2">{n0(soma(l => l.reativadasMes))}</td>
                  <td className="num">{r0(comissaoMes)}</td>
                  <td className="num col-p3">{r0(soma(l => l.geradoTotal))}</td>
                  <td className="num col-p3">{r0(soma(l => l.pago))}</td>
                  <td className="num">{r0(saldo)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>

      {receitas.length > 0 && (
        <Panel title="Participação na receita · corretagem, zeragem e incentivo" subtitle={`Parceiros que recebem uma parte do que os clientes deles geram. A parte de cada um em ${mesLongo(mesRef)} e a posição até hoje. Clique no nome para ver cliente a cliente.`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Parceiro</th><th className="col-p3">Corretora</th><th className="num col-p2">Corretagem</th><th className="num col-p2">Zeragem</th><th className="num col-p2">Incentivo</th>
                  <th className="num max-sm:whitespace-normal">A receber de {mes}</th><th className="num col-p3">Gerado até hoje</th><th className="num col-p3">Pago até hoje</th><th className="num">Saldo a pagar</th>
                </tr>
              </thead>
              <tbody>
                {linhasReceita.map(r => {
                  // comissionado: os pagamentos e o saldo dele estão na linha de cima
                  const junto = r.junto
                  return (
                    <tr key={r.nome}>
                      <td className="font-medium"><Link href={abrir(r.nome)} className="link">{r.nome}</Link></td>
                      <td className="muted col-p3">{r.corretoras.map(c => CORRETORA_LABEL[c]).join(', ')}</td>
                      <td className={cn('num col-p2', !r.corretagem && 'subtle')}>{r0(r.corretagem)}</td>
                      <td className={cn('num col-p2', !r.zeragem && 'subtle')}>{r0(r.zeragem)}</td>
                      <td className={cn('num col-p2', !r.incentivo && 'subtle')}>{r0(r.incentivo)}</td>
                      <td className={cn('num font-semibold', !r.mes && 'subtle')}>{r0(r.mes)}</td>
                      <td className="num col-p3" title={r.doBtg ? `Inclui ${r0(r.doBtg)} da participação dele na comissão do BTG` : undefined}>{r0(r.gerado)}</td>
                      <td className={cn('num col-p3', junto && 'subtle')} title={junto ? 'Os pagamentos dele estão na linha de Comissionados' : undefined}>{junto ? TRACO : r0(r.pago)}</td>
                      <td className={cn('num font-semibold', junto || !r.saldo ? 'subtle' : r.saldo < 0 && 'text-warn')} title={junto ? 'Somado ao saldo dele em Comissionados' : undefined}>{junto ? TRACO : r0(r.saldo)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {linhasBtg.length > 0 && (
        <Panel title="Participação na comissão do BTG"
          subtitle={`Parceiros que levam uma parte da comissão que o BTG paga sobre os clientes deles (a aba própria do fechamento). A parte de cada um em ${mesLongo(mesRef)} e a posição até hoje, com a mesma conta do Painel do BTG.${previaBtg ? ' Antes do fechamento do mês o valor é uma prévia.' : ''} Clique no nome para ver cliente a cliente.`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead>
                <tr>
                  <th>Parceiro</th><th className="num col-p2">Receita dos clientes dele</th><th className="num col-p2">Comissão do BTG sobre eles</th>
                  <th className="num max-sm:whitespace-normal">A receber de {mes}</th><th className="num col-p3">Gerado até hoje</th><th className="num col-p3">Pago até hoje</th><th className="num">Saldo a pagar</th>
                </tr>
              </thead>
              <tbody>
                {linhasBtg.map(b => (
                  <tr key={b.nome}>
                    <td className="font-medium"><Link href={abrir(b.nome)} className="link">{b.nome}</Link></td>
                    <td className={cn('num col-p2', !b.receita && 'subtle')}>{r0(b.receita)}</td>
                    <td className={cn('num col-p2', !b.comissao && 'subtle')}>{r0(b.comissao)}</td>
                    <td className={cn('num font-semibold', !b.mes && 'subtle')}>{r0(b.mes)}</td>
                    <td className={cn('num col-p3', !b.gerado && 'subtle')}>{r0(b.gerado)}</td>
                    <td className={cn('num col-p3', (b.junto || !b.pago) && 'subtle')} title={b.junto ? `Os pagamentos dele estão na linha de ${b.junto}` : undefined}>{b.junto ? TRACO : r0(b.pago)}</td>
                    <td className={cn('num font-semibold', b.junto || !b.saldo ? 'subtle' : b.saldo < 0 && 'text-warn')} title={b.junto ? `Somado ao saldo dele em ${b.junto}` : undefined}>{b.junto ? TRACO : r0(b.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  )
}
