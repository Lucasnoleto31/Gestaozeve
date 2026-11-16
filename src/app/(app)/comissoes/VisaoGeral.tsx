// Visão geral das comissões: uma linha por comissionado com o que gerou no mês, o que já foi pago e o
// saldo, e quem tem participação na receita: em corretagem, zeragem e incentivo dos clientes dele
// (parceiros_receita, com pagamentos e saldo) ou na comissão do BTG (aba própria no fechamento). É a porta
// de entrada da tela: "quanto devo a cada um?". As origens do campo Parceiro da ficha não aparecem: não recebem.
import Link from 'next/link'
import { comissaoItens, comissaoMensal, comissaoPagamentos, painelMensal, parametrosDaCorretora } from '@/lib/gestao/consultas'
import { participacaoReceita, regrasDoParceiroPorCorretora, type RegrasCorretora } from '@/lib/gestao/consultasParticipacao'
import { nomesComRegra, resumirReceita } from '@/lib/gestao/participacao'
import { resumirComissao } from '@/lib/gestao/comissao'
import { calcularRepasse, configBtg } from '@/lib/gestao/btg'
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

type Participacao = { nome: string; receita: number; comissao: number; parte: number }
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

// Parceiros com participação na comissão do BTG (parâmetro repasse_parceiros): a parte deles no mês,
// com a mesma conta do Painel. Qualquer falha aqui só esconde o bloco.
async function participacoesBtg(mesRef: string): Promise<Participacao[]> {
  try {
    const cfg = configBtg((await parametrosDaCorretora('BTG')).parametros)
    if (!cfg.parceiros.length) return []
    const [mensal, livros] = await Promise.all([
      painelMensal('BTG', mesRef, 1),
      Promise.all(cfg.parceiros.map(async x => ({ nome: x.nome, linhas: await comissaoMensal(mesRef, 1, x.nome, 'BTG') }))),
    ])
    const receita = mensal.find(m => m.mes_ref === mesRef)?.receita ?? 0
    const dosParceiros = Object.fromEntries(livros.map(l => [l.nome, l.linhas.find(x => x.mes_ref === mesRef)?.receita_carteira ?? 0]))
    return calcularRepasse(receita, cfg, mesRef, dosParceiros).parceiros.map(p => ({ nome: p.nome, receita: p.receita, comissao: p.comissao, parte: p.parceiro }))
  } catch {
    return []
  }
}

export async function VisaoGeral({ parceiros, corretora, mesRef, verBtg, regras = [] }: { parceiros: ParceiroComissao[]; corretora: Corretora | null; mesRef: string; verBtg: boolean; regras?: RegrasCorretora[] }) {
  const comissionados = parceiros.filter(p => p.comissionado)
  const [porConta, participacoes, receitas] = await Promise.all([
    Promise.all(comissionados.map(async p => {
      const [itens, pagamentos, mensal] = await Promise.all([comissaoItens(p.nome, corretora), comissaoPagamentos(p.nome), comissaoMensal(mesRef, 1, p.nome, corretora)])
      const visiveis = pagamentosDoFiltro(pagamentos, corretora)
      const r = resumirComissao(itens, mensal, visiveis, mesRef, () => 0)
      return { nome: p.nome, ...r, pagoMes: visiveis.filter(x => parseMes(x.mes_ref) === mesRef).reduce((s, x) => s + x.valor, 0) }
    })),
    verBtg && (!corretora || corretora === 'BTG') ? participacoesBtg(mesRef) : Promise.resolve([] as Participacao[]),
    participacoesReceita(regras, corretora, mesRef),
  ])
  // Quem é comissionado e também tem participação na receita tem uma conta só: os pagamentos dele já
  // abatem na linha de comissionado, então o que gerou de participação entra no gerado e no saldo dessa linha
  const receitaDe = (nome: string) => receitas.find(r => normTexto(r.nome) === normTexto(nome))
  const linhas = porConta.map(l => { const r = receitaDe(l.nome); return r ? { ...l, geradoTotal: round2(l.geradoTotal + r.gerado), saldo: round2(l.saldo + r.gerado) } : l })
  const soDeReceita = receitas.filter(r => !porConta.some(l => normTexto(l.nome) === normTexto(r.nome)))
  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0)
  const comissaoMes = soma(l => l.comissaoMes), saldo = soma(l => l.saldo)
  const receitaMes = round2(receitas.reduce((s, r) => s + r.mes, 0))
  const pagoMes = soma(l => l.pagoMes) + soDeReceita.reduce((s, r) => s + r.pagoMes, 0)
  // quem tem a receber não é compensado por quem recebeu a mais: são pessoas diferentes
  const aPagar = soma(l => Math.max(0, l.saldo)) + soDeReceita.reduce((s, r) => s + Math.max(0, r.saldo), 0)
  const adiantado = soma(l => Math.max(0, -l.saldo)) + soDeReceita.reduce((s, r) => s + Math.max(0, -r.saldo), 0)
  const eventos = soma(l => l.abertasMes + l.ativacoesMes + l.reativadasMes)
  const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
  const reais = (v: number) => (v ? rCurto(v) : 'R$ 0')
  const mes = mesCurto(mesRef)
  const abrir = (nome: string, aba?: string) => hrefComissoes({ parceiro: nome, corretora, mes: mesRef, aba })

  return (
    <>
      <KpiRow cols={4}>
        {receitas.length > 0
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
                  <th className="num">A receber de {mes}</th><th className="num col-p3">Gerado até hoje</th><th className="num col-p3">Pago até hoje</th><th className="num">Saldo a pagar</th>
                </tr>
              </thead>
              <tbody>
                {receitas.map(r => {
                  // comissionado: os pagamentos e o saldo dele estão na linha de cima
                  const junto = !soDeReceita.includes(r)
                  return (
                    <tr key={r.nome}>
                      <td className="font-medium"><Link href={abrir(r.nome)} className="link">{r.nome}</Link></td>
                      <td className="muted col-p3">{r.corretoras.map(c => CORRETORA_LABEL[c]).join(', ')}</td>
                      <td className={cn('num col-p2', !r.corretagem && 'subtle')}>{r0(r.corretagem)}</td>
                      <td className={cn('num col-p2', !r.zeragem && 'subtle')}>{r0(r.zeragem)}</td>
                      <td className={cn('num col-p2', !r.incentivo && 'subtle')}>{r0(r.incentivo)}</td>
                      <td className={cn('num font-semibold', !r.mes && 'subtle')}>{r0(r.mes)}</td>
                      <td className="num col-p3">{r0(r.gerado)}</td>
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

      {participacoes.length > 0 && (
        <Panel title="Participação na receita · BTG" subtitle={`Parceiros que levam uma parte da comissão que o BTG paga sobre os clientes deles (a aba própria do fechamento). Valor de ${mesLongo(mesRef)}, com a mesma conta do Painel do BTG.`}>
          <div className="tbl-wrap">
            <table className="tbl tbl-dense">
              <thead><tr><th>Parceiro</th><th className="num col-p2">Receita dos clientes dele</th><th className="num col-p2">Comissão do BTG sobre eles</th><th className="num">Parte do parceiro</th></tr></thead>
              <tbody>
                {participacoes.map(p => (
                  <tr key={p.nome}>
                    <td className="font-medium"><Link href={abrir(p.nome, 'extrato')} className="link">{p.nome}</Link></td>
                    <td className="num col-p2">{r0(p.receita)}</td>
                    <td className="num col-p2">{r0(p.comissao)}</td>
                    <td className="num font-semibold">{r0(p.parte)}</td>
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
