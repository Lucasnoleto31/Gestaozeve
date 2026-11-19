// Peças de apresentação do Painel no celular (DESIGN.md §8), comuns às três abas. Nada aqui muda o
// computador: tudo é max-md: (só abaixo de 768 px) ou um par de trechos, um para cada aparelho.

// O apoio de um cartão em duas versões: a do computador, como sempre, e a curta do celular (uma comparação só)
export const apoio = (computador: string, celular: string) => (
  <><span className="max-md:hidden">{computador}</span><span className="md:hidden">{celular}</span></>
)

// Título de bloco que só aparece no computador (no celular o bloco recolhido já mostra o título na linha que abre)
export const soNoComputador = (texto: string) => <span className="max-md:hidden">{texto}</span>

// No celular o link pega a linha inteira: o número sozinho é um alvo de poucos pixels. O elemento que
// contém a linha leva max-md:relative.
export const LINHA_INTEIRA = 'max-md:after:absolute max-md:after:inset-0'

// Link de texto pequeno ("ver todos", "ver mês a mês") com área de dedo, sem mexer no desenho
export const TOQUE = 'max-md:-my-3 max-md:inline-block max-md:py-3'

// Quantas linhas as listas de clientes do Painel mostram no celular; o resto fica em "ver todos"
export const NO_CELULAR = 5
