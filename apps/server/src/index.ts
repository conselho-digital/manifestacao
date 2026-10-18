import { createServer } from "node:http";
import { TICK_RATE, TEAM_IDS, type TeamId } from "@manifestacao/shared";

/**
 * Servidor de jogo (stub da Fase 0).
 *
 * Ainda não sincroniza jogadores — na Fase 0 o movimento é local no cliente.
 * Este processo existe para firmar a forma: um endpoint de saúde e o laço de
 * tick autoritativo que, a partir da Fase 1, processará input e emitirá
 * snapshots via WebSocket. Nunca confiar em dados do cliente (CLAUDE.md §6).
 */

const PORT = Number(process.env.PORT ?? 2567);

function emptyScores(): Record<TeamId, number> {
  return Object.fromEntries(TEAM_IDS.map((t) => [t, 0])) as Record<TeamId, number>;
}

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tickRate: TICK_RATE, scores: emptyScores() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// Laço de tick autoritativo (placeholder até a Fase 1 ligar o estado real).
const tickMs = 1000 / TICK_RATE;
const loop = setInterval(() => {
  // TODO(fase 1): processar fila de input, mover jogadores, emitir snapshot.
}, tickMs);

server.listen(PORT, () => {
  console.log(`[server] jogo escutando em http://localhost:${PORT} (tick ${TICK_RATE}/s)`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    clearInterval(loop);
    server.close(() => process.exit(0));
  });
}
