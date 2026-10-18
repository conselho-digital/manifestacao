/**
 * Tipos compartilhados entre cliente, servidor de jogo e API.
 * O servidor é sempre autoritativo: nunca confiar em posição, saldo ou
 * item enviado pelo cliente (ver CLAUDE.md §6).
 */

export * from "./teams.js";
export * from "./protocol.js";
export * from "./world.js";
