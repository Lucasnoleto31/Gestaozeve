// Parte do tema que roda também no servidor (layout raiz lê o cookie).
// Nada de React aqui: o módulo 'use client' (theme.tsx) importa deste.

export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_COOKIE = 'zeve-theme'
export const THEME_STORAGE_KEY = 'zeve-theme'

export function isThemePref(v: unknown): v is ThemePref {
  return v === 'light' || v === 'dark' || v === 'system'
}

// Roda inline no <head> antes da hidratação: aplica a classe .dark e o
// color-scheme certos, então a página nasce no tema escolhido (sem piscar).
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'&&t!=='system'){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);t=m?m[1]:'system'}var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light'}catch(e){}})();`
