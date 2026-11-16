// O seletor de corretora do topo (desktop) e do menu (celular): qual corretora ele marca e para onde cada
// botão leva, pela rota em que a pessoa está. Sem React: testado em seletorCorretora.test.ts.
//  - Página de uma corretora (/genial/clientes): marca a da rota; trocar leva à mesma página na outra.
//  - Tela geral com filtro de corretora no endereço (Comissões, ?corretora=): o seletor É esse filtro.
//    Marca a corretora filtrada, ganha a opção "Todas" e troca o filtro sem sair da tela, mantendo o resto
//    do endereço (parceiro, mês, aba). Antes ele marcava a última corretora aberta, sem relação com a tela,
//    e clicar em BTG tirava a pessoa de Comissões e levava ao Painel do BTG (Lucas, 16/11/2026: "seleciono
//    Atual Capital, ele vai para a Genial e eu troco para BTG ele vai para a tela início").
//  - Outras telas gerais (Início, Leads, Funil…): marca a última corretora aberta e leva ao Painel dela.
import { CORRETORA_SLUG, corretoraDoSlug, isCorretora, type Corretora } from '@/lib/corretoras'

// Telas gerais que filtram por corretora com ?corretora= no endereço
export const ROTAS_COM_FILTRO_DE_CORRETORA = ['/comissoes']

export type SeletorCorretora = {
  filtro: boolean                          // o seletor filtra a própria tela (aparece a opção "Todas")
  marcada: Corretora | null                // a corretora acesa (null = todas; só acontece quando filtro)
  atual: Corretora                         // a corretora dos atalhos do menu (Painel, Clientes…)
  href: (c: Corretora | null) => string    // para onde vai ao escolher c (null = todas, só quando filtro)
}

export function seletorCorretora(pathname: string, busca: string, padrao: Corretora, ehPaginaDaCorretora: (id: string) => boolean): SeletorCorretora {
  const seg = pathname.split('/').filter(Boolean)
  const naRota = corretoraDoSlug(seg[0])
  if (naRota) {
    // ao trocar de corretora, fica na mesma página (ou vai para o painel)
    const pagina = seg[1] && ehPaginaDaCorretora(seg[1]) ? seg[1] : 'painel'
    return { filtro: false, marcada: naRota, atual: naRota, href: c => `/${CORRETORA_SLUG[c ?? naRota]}/${pagina}` }
  }
  if (ROTAS_COM_FILTRO_DE_CORRETORA.some(r => pathname === r || pathname.startsWith(`${r}/`))) {
    const params = new URLSearchParams(busca)
    const pedida = params.get('corretora')
    const marcada = isCorretora(pedida) ? pedida : null
    return {
      filtro: true, marcada, atual: marcada ?? padrao,
      href: c => {
        const p = new URLSearchParams(params)
        if (c) p.set('corretora', c); else p.delete('corretora')
        const qs = p.toString()
        return qs ? `${pathname}?${qs}` : pathname
      },
    }
  }
  return { filtro: false, marcada: padrao, atual: padrao, href: c => `/${CORRETORA_SLUG[c ?? padrao]}/painel` }
}
