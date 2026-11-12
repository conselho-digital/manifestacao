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

## Armas brancas (enviadas pelo dono do projeto)
- `public/models/weapons/cricket-bat.glb`: taco de críquete do jogo Bully: Scholarship Edition (Rockstar Vancouver), convertido de DFF/TXD.
- `public/models/weapons/baseball-bat.glb`: taco de beisebol para GTA San Andreas ("Деревянная бита", textura e ícone de Tttt Yyyy, libertycity.ru), convertido de DFF/TXD.
- Animações das armas brancas (`Bat_*`): `baseball.ifp` do GTA San Andreas (Rockstar North), enviado pelo dono do projeto.
- Pacote de armas brancas (garrafa quebrada, cano, cutelo, foice, machado): modelos GTA SA enviados pelo dono do projeto (autor não informado no pacote), convertidos de DFF/TXD em `public/models/weapons/`.
- Fuzis (enviados pelo dono do projeto, convertidos de DFF/TXD): M4A1/HK416 (`m4a1.glb`), M16 do GTA 3 portado para o SA (`m16.glb`, textura lisa) e Honey Badger estilo SA (`honey-badger.glb`, mp5lng.dff). Autores não informados nos pacotes.
- `public/models/weapons/python357.glb`: revólver Colt Python .357 (pacote "A.V.A Python 357", variante Stock, enviado pelo dono do projeto, convertido de DFF/TXD; autor não informado no pacote). É a pistola do jogo.

- Renault Duster 2025 Polícia Militar (viatura): modelo enviado pelo usuário (arquivo rar com copcarla.dff/.txd); autor e licença não informados — conferir antes de divulgar.
