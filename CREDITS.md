# Créditos de assets

Registro de todo asset de terceiros usado no jogo, com autor, licença, link e
data de download. Obrigatório manter atualizado (CLAUDE.md §9): assets CC0 não
exigem crédito, mas registramos mesmo assim como prova de licença; assets CC-BY
**exigem** o crédito abaixo e também numa tela de créditos no jogo.

## Modelos 3D / sprites

| Arquivo | Descrição | Licença | Uso |
|---|---|---|---|
| `apps/client/public/models/scenery/masp.glb` | MASP (Museu de Arte de São Paulo), simplificado — marco visual do cenário | CC0 (informado pelo usuário) | Prédio de cenário no mapa inicial |

Os avatares de personagem ainda são geométricos, gerados por código.

Fontes aprovadas para uso comercial (ver CLAUDE.md §6):

| Fonte | Licença | Uso | Link |
|---|---|---|---|
| KayKit (Kay Lousberg) | CC0 | Personagens riggados + 133 animações (caminhada) | https://kaylousberg.itch.io/kaykit-character-animations |
| Quaternius | CC0 | Personagens, veículos, props | https://quaternius.com |
| Kenney.nl | CC0 | Kits urbanos (ruas, carros) | https://kenney.nl/assets |
| Poly Haven | CC0 | HDRIs de iluminação, texturas | https://polyhaven.com |
| Poly Pizza | CC0 / CC-BY | Agregador low-poly (GLB) | https://poly.pizza |
| Sketchfab | CC0 / CC-BY | Avulsos (filtrar, excluir NC/ND) | https://sketchfab.com |

Mixamo (Adobe) pode ser usado para animação/rig, mas **não redistribuir** os
arquivos crus — só embutidos no bundle já convertidos para GLB.

**Não usar**: CC-BY-NC (proíbe uso comercial) e CC-BY-ND (proíbe derivados).
**Não usar** modelos que representem pessoas reais (direito de imagem).

## Fontes e áudio

_(a preencher conforme entrarem.)_

## Mapa "Av. Paulista" (dados abertos)

- **Ruas e prédios** (contornos e alturas): © contribuidores do OpenStreetMap, licença ODbL
  (https://www.openstreetmap.org/copyright). Extraídos pela API do OpenStreetMap para a área desenhada pelo operador;
  o trecho processado fica em `apps/client/src/game/paulista/data.json`. Obras derivadas (o mapa jogável) exigem o
  crédito acima; se a base extraída for publicada, deve permanecer sob a ODbL.
- Nenhum dado do Google (Street View, satélite, modelos 3D) foi usado.
