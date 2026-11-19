// As classes do "mostrar mais" do celular (DESIGN.md §8.7), num arquivo sem 'use client' de propósito: o
// que um módulo de cliente exporta chega a um componente de servidor como referência, não como texto, e a
// classe sumiria (a lista viria inteira). Daqui tanto a página de servidor quanto o MostrarMais importam.

// a linha que só aparece no celular depois do toque em "mostrar mais" (dentro de um <MostrarMais>)
export const ALEM_NO_CELULAR = 'max-md:group-data-[tudo=false]/mais:hidden!'

// para a i-ésima linha de uma lista que mostra `limite` linhas no celular
export const alemDe = (limite: number) => (i: number) => (i >= limite ? ALEM_NO_CELULAR : undefined)
