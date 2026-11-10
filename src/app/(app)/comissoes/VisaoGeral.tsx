// Visão geral das comissões: uma linha por comissionado com o que gerou no mês, o que já foi pago e o
// saldo; quem tem participação na receita (aba própria no fechamento do BTG); e os parceiros que vêm
// só do campo da ficha. É a porta de entrada da tela: "quanto devo a cada um?".
import Link from 'next/link'
import { comissaoItens, comissaoMensal, comissaoPagamentos, painelMensal, parametrosDaCorretora } from '@/lib/gestao/consultas'
import { resumirComissao } from '@/lib/gestao/comissao'
import { calcularRepasse, configBtg } from '@/lib/gestao/btg'
import { mesCurto, mesLongo, parseMes } from '@/lib/gestao/meses'
import type { Corretora } from '@/lib/corretoras'
import type { Parceiro } from '@/lib/gestao/tipos'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { KpiCard, KpiRow } from '@/components/ui/Kpi'
import { Panel } from '@/components/ui/Panel'
import { LinhaVazia, n0, r0, rCurto } from '@/components/gestao/Celulas'
import { hrefComissoes, pagamentosDoFiltro } from './comum'

type Participacao = { nome: string; receita: number; comissao: number; parte: number }

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

export async function VisaoGeral({ parceiros, corretora, mesRef, verBtg }: { parceiros: Parceiro[]; corretora: Corretora | null; mesRef: string; verBtg: boolean }) {
  const comissionados = parceiros.filter(p => p.comissionado)
  const outros = parceiros.filter(p => !p.comissionado)
  const [linhas, participacoes] = await Promise.all([
    Promise.all(comissionados.map(async p => {
      const [itens, pagamentos, mensal] = await Promise.all([comissaoItens(p.nome, corretora), comissaoPagamentos(p.nome), comissaoMensal(mesRef, 1, p.nome, corretora)])
      const visiveis = pagamentosDoFiltro(pagamentos, corretora)
      const r = resumirComissao(itens, mensal, visiveis, mesRef, () => 0)
      return { nome: p.nome, ...r, pagoMes: visiveis.filter(x => parseMes(x.mes_ref) === mesRef).reduce((s, x) => s + x.valor, 0) }
    })),
    verBtg && (!corretora || corretora === 'BTG') ? participacoesBtg(mesRef) : Promise.resolve([] as Participacao[]),
  ])
  const soma = (f: (l: (typeof linhas)[number]) => number) => linhas.reduce((s, l) => s + f(l), 0)
  const comissaoMes = soma(l => l.comissaoMes), saldo = soma(l => l.saldo), pagoMes = soma(l => l.pagoMes)
  // quem tem a receber não é compensado por quem recebeu a mais: são pessoas diferentes
  const aPagar = soma(l => Math.max(0, l.saldo)), adiantado = soma(l => Math.max(0, -l.saldo))
  const eventos = soma(l => l.abertasMes + l.ativacoesMes + l.reativadasMes)
  const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`
  const mes = mesCurto(mesRef)
  const abrir = (nome: string, aba?: string) => hrefComissoes({ parceiro: nome, corretora, mes: mesRef, aba })

  return (
    <>
      <KpiRow cols={4}>
        <KpiCard destaque label={`Comissão de ${mes}`} value={rCurto(comissaoMes)} sub={`${fmtNum(comissionados.length)} ${comissionados.length === 1 ? 'comissionado' : 'comissionados'} · abertura, ativação e reativação`} />
        <KpiCard label="A pagar" value={aPagar ? rCurto(aPagar) : 'R$ 0'} sub={adiantado ? `gerado menos pago · ${rCurto(adiantado)} já pagos a mais a outro parceiro` : 'tudo o que foi gerado menos o que já foi pago'} />
        <KpiCard label={`Pago referente a ${mes}`} value={pagoMes ? rCurto(pagoMes) : 'R$ 0'} sub="pagamentos lançados com este mês de referência" />
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

      {outros.length > 0 && (
        <Panel title="Outros parceiros e origens" subtitle="Vêm do campo Parceiro da ficha dos clientes e não têm comissão cadastrada. Servem para ver a carteira e gerar o extrato do mês.">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-dense">
            {outros.map(p => (
              <li key={p.nome}>
                <Link href={abrir(p.nome, 'extrato')} className="link">{p.nome}</Link>
                <span className="ml-1.5 text-micro text-fg-subtle">{fmtNum(p.clientes)} {p.clientes === 1 ? 'ficha' : 'fichas'}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
