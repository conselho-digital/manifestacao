import { createServer } from "node:http";

/**
 * API HTTP (stub da Fase 0).
 *
 * Nas próximas fases cuidará de contas, loja, pagamentos (Pix via Woovi),
 * inventário e moderação. Por ora expõe apenas um endpoint de saúde para
 * firmar a forma do serviço e o deploy.
 */

const PORT = Number(process.env.PORT ?? 3000);

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "api" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[api] escutando em http://localhost:${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
