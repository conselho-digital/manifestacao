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
  fist: svg('<path d="M8 4a2 2 0 0 1 2 2v1h1V5a2 2 0 0 1 4 0v2h1V6a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-2c-3 0-6-2-6-5v-3a2 2 0 0 1 2-2h1V6a2 2 0 0 1 2-2z"/>'),
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
  anim: svg('<path d="M12 2a2.2 2.2 0 1 1 0 4.4A2.2 2.2 0 0 1 12 2zM9 8h6l1 5-2 .5V22h-2v-6h-2v6H8v-8.5L6 13z"/>'),
};
