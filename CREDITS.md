# Créditos dos modelos 3D

Modelos licenciados CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/).
Alterações: texturas reduzidas para 512x512 (WebP); Akiyama com malha simplificada; "Law Members" dividido em 9 arquivos.

| Arquivos | Título | Autor | Fonte |
| --- | --- | --- | --- |
| `characters/Law1..Law9.glb` | GTA SA Law Members | Diddy_Blud_117 | https://sketchfab.com/marcosacevez57 |
| `weapons/AK47.glb` | GTA SA AK-47 | Diddy_Blud_117 | https://sketchfab.com/marcosacevez57 |
| `characters/Akiyama.glb` | cj akiyama | Nxrmalman. | https://sketchfab.com/releon__evil |

Os 8 primeiros personagens (Helena, Stewart, Bennyse, Amanda, Garota1, Carlos, Gordao, Cesar) ainda **não têm licença verificada**.
Os originais ficam em `assets-src/`; os otimizados, em `public/models/`.

## Animações

`public/anims/ped.json` foi convertido do `ped.ifp` (pacote "Re Anims Custom Ped", de JB RE ANIMS;
créditos do próprio pacote: Sprinting Stories — Calm, SlingShot753, HackMan128).
Clips usados: `IDLE_stance`, `WALK_civi`, `run_civi`. **Licença não verificada** (animações derivadas de GTA San Andreas).
Funcionam só em esqueletos GTA SA padrão (Law1 a Law9). Carlos e os demais ainda não têm animação.

## Mapa

`public/models/map/masp.glb` — "MASP - Museu de Arte de São Paulo (simplificado)", por ximboleta
(https://sketchfab.com/ximboleta), licença CC-BY-4.0. Original em `assets-src/masp-original.glb`. Escalado para 60 m.
Fonte: https://sketchfab.com/3d-models/masp-museu-de-arte-de-sao-paulo-simplificado-7eb9d1c77f9b43b088128fc5baa249bb
O restante da cidade é gerado por código (`src/game/city.ts`), inspirado na maquete da Av. Paulista (foto enviada pelo autor do projeto).

## Modelos GTA SA convertidos (verificar licença/autoria antes de publicar)
- Carros Blista Compact e Buffalo (DFF/TXD fornecidos pelo usuário, convertidos para GLB; texturas genéricas de veículo do jogo original ausentes: cores sólidas).
- Bandeira da Turquia (shovel.dff) e placa de trânsito (shovel.dff, créditos do readme: Timske, MFCL).
- Motos Harley-Davidson Black Death (freeway.dff) e Triumph Speed Triple (pcj600.dff), convertidas e simplificadas.
- Moto BMW S1000RR (VietTuan / DiChoiKoCung), convertida e simplificada.
- Moto Suzuki GSX-R600 (nrg500.dff do pacote), convertida e simplificada.
- Chevrolet Spin LTZ 2025 PMESP (copcarla.dff do pacote), simplificado para ~86 mil triângulos.

## Armas brancas (enviadas pelo dono do projeto)
- `public/models/weapons/cricket-bat.glb`: taco de críquete do jogo Bully: Scholarship Edition (Rockstar Vancouver), convertido de DFF/TXD.
- `public/models/weapons/baseball-bat.glb`: taco de beisebol para GTA San Andreas ("Деревянная бита", textura e ícone de Tttt Yyyy, libertycity.ru), convertido de DFF/TXD.
- Animações das armas brancas (`Bat_*`): `baseball.ifp` do GTA San Andreas (Rockstar North), enviado pelo dono do projeto.
