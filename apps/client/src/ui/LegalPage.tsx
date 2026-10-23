import { useEffect } from "react";

export type LegalKind = "sobre" | "termos" | "privacidade";

/** Páginas estáticas acessíveis por /sobre, /termos e /privacidade (ver main.tsx e vercel.json). */
export function legalKindFromPath(pathname: string): LegalKind | null {
  const p = pathname.replace(/\/+$/, "");
  return p === "/sobre" || p === "/termos" || p === "/privacidade" ? (p.slice(1) as LegalKind) : null;
}

const OPERATOR = (import.meta.env.VITE_OPERATOR_NAME as string | undefined)?.trim() || "o operador do jogo";
const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || "";

const TITLES: Record<LegalKind, string> = {
  sobre: "Sobre",
  termos: "Termos de uso",
  privacidade: "Política de privacidade",
};

function Contact() {
  return CONTACT ? (
    <a href={`mailto:${CONTACT}`} style={{ color: "var(--accent)" }}>
      {CONTACT}
    </a>
  ) : (
    <span>o canal de contato indicado pelo operador</span>
  );
}

function Sobre() {
  return (
    <>
      <p>
        Manifestação Online é um jogo de navegador, multiplayer e 3D, em que jogadores de equipes diferentes se reúnem numa
        avenida virtual: andam, conversam, pixam, exibem cartazes e bandeiras e usam veículos. É uma sátira e um espaço de
        brincadeira — não é um canal oficial de nenhuma pessoa, partido, campanha ou instituição.
      </p>
      <p>
        O jogo é independente e tem identidade própria. Os nomes das equipes, as bandeiras e os produtos são definidos por{" "}
        {OPERATOR}, que é responsável por esse conteúdo. Os personagens são fictícios e não representam pessoas reais.
      </p>
      <p>
        Os modelos 3D e demais materiais de terceiros usados no jogo seguem licenças que permitem uso comercial; as
        atribuições estão em <code>CREDITS.md</code> no repositório do projeto.
      </p>
      <p>
        Dúvidas, denúncias ou pedidos sobre seus dados: <Contact />.
      </p>
    </>
  );
}

function Termos() {
  return (
    <>
      <h2>1. Quem somos e o que é o serviço</h2>
      <p>
        O serviço é operado por {OPERATOR} ("operador"). Ao entrar com sua conta Google e jogar, você concorda com estes
        termos. Se não concordar, não use o serviço.
      </p>
      <h2>2. Conta</h2>
      <p>
        O acesso é feito só pela conta Google. Você é responsável por tudo o que acontece na sua conta. Pode excluí-la a
        qualquer momento em Opções → "Excluir minha conta".
      </p>
      <h2>3. Regras de convivência</h2>
      <p>
        É proibido: assédio, ameaças, discurso de ódio, conteúdo sexual envolvendo menores, divulgação de dados pessoais de
        terceiros, golpes, spam, uso de bots ou trapaças, e tentativas de burlar a segurança do serviço. Chat, cartazes,
        superchats e telões passam por filtro automático e, quando pagos, por revisão antes de serem exibidos. O operador pode
        silenciar, remover conteúdo ou banir contas que violem estas regras, com ou sem aviso prévio.
      </p>
      <h2>4. Conteúdo que você envia</h2>
      <p>
        Você é responsável pelo que escreve, fala ou exibe. Ao enviar um conteúdo para exibição pública, você autoriza o
        operador a exibi-lo no jogo pelo tempo da exibição. Conversa e voz são efêmeras: não são gravadas nem guardadas.
      </p>
      <h2>5. Compras</h2>
      <p>
        Itens (bandeiras, veículos, personagens, passes) são vendidos por pagamento único via Pix, sem assinatura. O item só
        é liberado após a confirmação do pagamento. Lances de telão superados viram crédito na plataforma. Itens são pessoais e
        intransferíveis. Pelo Código de Defesa do Consumidor, você pode pedir o cancelamento da compra em até 7 dias; escreva
        para <Contact /> informando a conta e o item.
      </p>
      <h2>6. Disponibilidade</h2>
      <p>
        O serviço é oferecido "como está", podendo mudar, ser interrompido ou ter dados efêmeros descartados a qualquer
        momento. Não garantimos funcionamento ininterrupto.
      </p>
      <h2>7. Contato</h2>
      <p>
        Dúvidas, denúncias e pedidos: <Contact />.
      </p>
    </>
  );
}

function Privacidade() {
  return (
    <>
      <p>
        Esta política explica, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018), quais dados tratamos, por
        quê e quais são seus direitos. O controlador dos dados é {OPERATOR}. Contato do encarregado (DPO) e do titular:{" "}
        <Contact />.
      </p>
      <h2>Dados que tratamos</h2>
      <ul>
        <li>
          <strong>Conta Google:</strong> identificador, e-mail verificado e nome (o nome vira sugestão de apelido, editável).
          Base legal: execução do serviço.
        </li>
        <li>
          <strong>Perfil:</strong> apelido, equipe, personagem e escolhas visuais. Parte fica também no seu navegador
          (armazenamento local).
        </li>
        <li>
          <strong>Compras:</strong> item, valor, referência e identificador do pagamento no Mercado Pago, status e datas. Não
          guardamos CPF nem dados de cartão; o pagamento ocorre no Mercado Pago. Recibos são enviados por e-mail (Resend).
          Base legal: execução de contrato e obrigação legal.
        </li>
        <li>
          <strong>Conteúdo enviado para exibição</strong> (superchats, cartazes, lances) e o resultado da moderação.
        </li>
        <li>
          <strong>Moderação:</strong> registro de ações (silêncio, banimento, remoção) com o identificador interno da conta.
          Base legal: legítimo interesse em segurança e cumprimento dos termos.
        </li>
      </ul>
      <h2>Dados que NÃO guardamos</h2>
      <p>
        Chat, posições, pixações e voz são efêmeros: passam em tempo real e não vão para o banco de dados. Não guardamos IP
        bruto.
      </p>
      <h2>Voz no palanque</h2>
      <p>
        A voz vai diretamente do falante para quem está ouvindo (conexão ponto a ponto, WebRTC), sem passar por nossos
        servidores e sem gravação. Por ser ponto a ponto, quem ouve pode, tecnicamente, ver o endereço IP de quem fala, como
        em qualquer chamada desse tipo. O microfone só é usado quando você toca em "Falar no palanque" e é desligado ao parar.
      </p>
      <h2>Com quem compartilhamos</h2>
      <p>
        Operadores de infraestrutura que tratam dados em nosso nome: Supabase (banco de dados, login e tempo real), Vercel
        (hospedagem), Mercado Pago (pagamentos), Resend (e-mail de recibo) e Google (login). Não vendemos dados.
      </p>
      <h2>Cookies e armazenamento local</h2>
      <p>
        Usamos um cookie para lembrar sua decisão sobre cookies e armazenamento local para guardar o personagem e preferências
        (como a qualidade gráfica). Não usamos cookies de rastreamento ou publicidade.
      </p>
      <h2>Por quanto tempo guardamos</h2>
      <p>
        Enquanto a conta existir. Ao excluí-la (Opções → "Excluir minha conta"), apagamos perfil, avatar, compras, itens,
        créditos e conteúdos enviados. Registros de moderação podem permanecer, sem dados pessoais além do identificador
        interno, pelo tempo necessário à segurança do serviço.
      </p>
      <h2>Seus direitos (art. 18 da LGPD)</h2>
      <p>
        Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, eliminação e informação sobre
        compartilhamento, além de revogar consentimentos. A exclusão da conta é feita por você mesmo no jogo; os demais pedidos,
        em <Contact />. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>
      <h2>Menores de idade</h2>
      <p>O serviço não é destinado a menores de 13 anos. Entre 13 e 17, o uso depende de ciência e consentimento de um responsável.</p>
    </>
  );
}

/** Página de texto legal (sobre / termos / privacidade), com link de volta ao jogo. */
export function LegalPage({ kind }: { kind: LegalKind }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${TITLES[kind]} — Manifestação Online`;
    return () => {
      document.title = prev;
    };
  }, [kind]);

  return (
    <main
      style={{
        height: "100dvh",
        overflowY: "auto",
        background: "var(--bg)",
        color: "var(--ink)",
        // O app trava rolagem/seleção no body (jogo); aqui é texto para ler e copiar.
        touchAction: "pan-y",
        userSelect: "text",
        WebkitUserSelect: "text",
      }}
    >
      <article
        style={{
          width: "min(720px, 100%)",
          margin: "0 auto",
          padding: "max(20px, env(safe-area-inset-top)) 16px 48px",
          fontSize: "var(--t-body)",
          lineHeight: 1.6,
        }}
      >
        <a href="/" style={{ color: "var(--accent)", fontSize: "var(--t-ui)", fontWeight: 700, display: "inline-flex", alignItems: "center", minHeight: 44 }}>
          ← Voltar ao jogo
        </a>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, textTransform: "uppercase", fontSize: 34, margin: "16px 0" }}>
          {TITLES[kind]}
        </h1>
        <div className="legal-body">
          {kind === "sobre" ? <Sobre /> : kind === "termos" ? <Termos /> : <Privacidade />}
        </div>
        <nav aria-label="Outras páginas" style={{ marginTop: 32, display: "flex", gap: 16, flexWrap: "wrap", fontSize: "var(--t-ui)" }}>
          {(Object.keys(TITLES) as LegalKind[])
            .filter((k) => k !== kind)
            .map((k) => (
              <a key={k} href={`/${k}`} style={{ color: "var(--ink-dim)", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
                {TITLES[k]}
              </a>
            ))}
        </nav>
      </article>
    </main>
  );
}

/** Links discretos para as páginas legais (rodapé da entrada e janela de opções). */
export function LegalLinks() {
  return (
    <nav
      aria-label="Páginas legais"
      style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 0, fontSize: "var(--t-ui)" }}
    >
      {(Object.keys(TITLES) as LegalKind[]).map((k) => (
        <a key={k} href={`/${k}`} target="_blank" rel="noopener" style={{ color: "var(--ink-dim)", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
          {TITLES[k]}
        </a>
      ))}
    </nav>
  );
}
