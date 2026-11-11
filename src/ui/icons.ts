// Ícones em SVG (texto fixo, sem dados de fora). Brancos, para fundo escuro.
const svg = (inner: string): string =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="#fff" stroke="none">${inner}</svg>`;

export const ICON = {
  left: svg('<path d="M4 12l9-8v5h7v6h-7v5z"/>'),
  right: svg('<path d="M20 12l-9-8v5H4v6h7v5z"/>'),
  up: svg('<path d="M12 4l8 9h-5v7H9v-7H4z"/>'),
  sign: svg('<path d="M12 2L2.5 17h19zM12 6.2L17.9 15H6.1z"/><path d="M11 17h2v5h-2z"/>'),
  pistol: svg('<path d="M3 8h14l2 1.5V12h-6l-1 2.5V18H7v-4.5L6 12H3z"/>'),
  bat: svg('<path d="M19.5 3.2l1.3 1.3-9 11.2-3.2 3.3-1.5-1.5 3.3-3.2z"/><path d="M5.2 17.8l1.5 1.5-2.6 2.6-1.5-1.5z"/>'),
  crouch: svg('<path d="M5 7l7 7 7-7-2-2-5 5-5-5z"/><path d="M5 17h14v3H5z"/>'),
  reload: svg('<path d="M12 5V2L8 6l4 4V7c3.3 0 6 2.7 6 6 0 1-.3 2-.7 2.8l1.5 1.5C19.5 16.2 20 14.7 20 13c0-4.4-3.6-8-8-8zm-6.8 2.2C4.5 8.8 4 10.3 4 12c0 4.4 3.6 8 8 8v3l4-4-4-4v3c-3.3 0-6-2.7-6-6 0-1 .3-2 .7-2.8L5.2 7.2z"/>'),
  swap: svg('<path d="M3 9h5l2-3h7l1 1h3v2h-3l-1 1h-5l-1 4H8l1-4H3z"/><path d="M6 18l3-3v2h8v2H9v2z"/>'),
  rifle: svg('<path d="M1 10.5h6.5l1.2-2H15l1 1h2l.8-1H23v2.2h-3.2l-1 1.3h-5.3l-1.2 5.5H9.6l1.1-5.5H1z"/>'),
  fist: `<svg viewBox="0 0 64 64" width="100%" height="100%" stroke="#2b1a0e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><rect x="19" y="47" width="28" height="13" rx="3" fill="#cfd6df"/><path d="M10 31c0-10 4-17 12-17h20c8 0 12 7 12 17v10c0 9-6 12-13 12H23c-8 0-13-3-13-12z" fill="#e9b98d"/><rect x="10" y="13" width="12" height="22" rx="6" fill="#f2c9a0"/><rect x="21" y="11" width="12" height="24" rx="6" fill="#f2c9a0"/><rect x="32" y="11" width="12" height="24" rx="6" fill="#f2c9a0"/><rect x="43" y="13" width="11" height="22" rx="5.5" fill="#f2c9a0"/><path d="M13 36h38c3 0 3 8 0 8H19c-8 0-9-8-6-8z" fill="#e0aa7c"/><path d="M17 28v-5M27 27v-6M38 27v-6M48 28v-5" fill="none" stroke-width="1.5" opacity=".55"/></svg>`,
  bullet: svg('<path d="M12 2c2.2 0 4 3 4 7v9H8V9c0-4 1.8-7 4-7zM7 19.5h10V22H7z"/>'),
  crosshair: svg('<circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="#fff" stroke-width="2"/>'),
  run: svg('<path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/>'),
  door: svg('<path d="M4 21V8.5L9 3h9a2 2 0 0 1 2 2v16H4zm2-2h12V5H9.9L6 9.3V19z"/><path d="M8 9.5h6V13H8zM14 15h3v2h-3z"/>'),
  plus: svg('<path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" fill="#9ad88a"/>'),
  shield: svg('<path d="M12 1L3 5v6c0 5.6 3.8 10.7 9 12 5.2-1.3 9-6.4 9-12V5l-9-4z" fill="#7db6ff"/>'),
  climb: svg('<path d="M3 21h18v-2H3zM5 17h4v-4h4V9h4V5h2V3h-8v4H8v4H4v4z"/>'),
  /** acelerador: pedal estreito com frisos */
  gas: svg('<path fill-rule="evenodd" d="M8.5 2h7a2 2 0 0 1 2 2v11.5l-2.2 5.5H8.7L6.5 15.5V4a2 2 0 0 1 2-2zM9 5v1.6h6V5H9zm0 3.6v1.6h6V8.6H9zm0 3.6v1.6h6v-1.6H9z"/>'),
  /** freio: pedal largo e baixo */
  brake: svg('<path fill-rule="evenodd" d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm2 3v1.5h10V8H7zm0 3.2v1.5h10v-1.5H7zm0 3.2v1.3h10v-1.3H7z"/><path d="M8 20h8v2H8z"/>'),
  /** freio de mão: o símbolo (P) do painel */
  handbrake: svg('<circle cx="12" cy="12" r="5.2" fill="none" stroke="#fff" stroke-width="2"/><path d="M5.2 7a7.6 7.6 0 0 0 0 10M18.8 7a7.6 7.6 0 0 1 0 10" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><text x="12" y="15.4" text-anchor="middle" font-family="Arial" font-weight="800" font-size="9" fill="#fff">P</text>'),
  mic: svg('<path d="M12 14a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 14z"/><path d="M18 10.5a6 6 0 0 1-12 0H4.5a7.5 7.5 0 0 0 6.75 7.46V21h1.5v-3.04A7.5 7.5 0 0 0 19.5 10.5z"/>'),
  micOff: svg('<path d="M12 14a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 14z"/><path d="M18 10.5a6 6 0 0 1-12 0H4.5a7.5 7.5 0 0 0 6.75 7.46V21h1.5v-3.04A7.5 7.5 0 0 0 19.5 10.5z"/><path d="M3 3.5L20.5 21" stroke="#ff6b5b" stroke-width="2.4" stroke-linecap="round" fill="none"/>'),
  gear: svg('<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>'),
  shop: svg('<path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>'),
  anim: svg('<path d="M12 2a2.2 2.2 0 1 1 0 4.4A2.2 2.2 0 0 1 12 2zM9 8h6l1 5-2 .5V22h-2v-6h-2v6H8v-8.5L6 13z"/>'),
};
