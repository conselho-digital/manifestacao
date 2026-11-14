# Cartazes das lojas (mapa Paulista)

Cada vitrine tem uma vaga de cartaz com um nome fixo. No jogo, a vaga mostra um cartaz de exemplo com esse nome em letras grandes.

**Nome da vaga** = `<prédio>_<lado><número da loja>`. Lado: `zp` = fachada voltada para +z, `zn` = para -z, `xp` = para +x, `xn` = para -x. Ex.: `N1_zn2` = prédio N1, fachada -z, 2ª loja.

## Como pôr uma imagem

1. Imagem 3:2 (ideal 1200 x 800 px), .webp, .jpg ou .png, leve (< 200 KB). O jogo corta para preencher.
2. Salve em `public/posters/` com qualquer nome sem espaços (ex.: `N1_zn2.webp`).
3. Liste em `public/posters/index.json`: `{ "posters": { "N1_zn2": "N1_zn2.webp", "NG_zn1": "promo.jpg" } }`.

As vagas sem imagem continuam com o cartaz de exemplo. Para ver onde fica cada vaga: ande pelo mapa, o nome está escrito no cartaz.

## Todas as vagas (181)

- **N2** (6): `N2_zp1`, `N2_zn1`, `N2_xp1`, `N2_xp2`, `N2_xn1`, `N2_xn2`
- **N1** (8): `N1_zp1`, `N1_zp2`, `N1_zn1`, `N1_zn2`, `N1_xp1`, `N1_xp2`, `N1_xn1`, `N1_xn2`
- **NT** (11): `NT_zn1`, `NT_zn2`, `NT_zn3`, `NT_xp1`, `NT_xp2`, `NT_xp3`, `NT_xp4`, `NT_xn1`, `NT_xn2`, `NT_xn3`, `NT_xn4`
- **NG** (7): `NG_zp1`, `NG_zp2`, `NG_zn1`, `NG_zn2`, `NG_xp1`, `NG_xp2`, `NG_xp3`
- **NC** (6): `NC_zp1`, `NC_zp2`, `NC_zn1`, `NC_zn2`, `NC_xn1`, `NC_xn2`
- **NB1** (6): `NB1_zp1`, `NB1_zn1`, `NB1_xp1`, `NB1_xp2`, `NB1_xn1`, `NB1_xn2`
- **NB2** (4): `NB2_zp1`, `NB2_zn1`, `NB2_xp1`, `NB2_xp2`
- **NB3** (1): `NB3_zp1`
- **H1** (2): `H1_zp1`, `H1_zn1`
- **H2** (3): `H2_zp1`, `H2_zn1`, `H2_xn1`
- **NM** (8): `NM_zp1`, `NM_zp2`, `NM_zn1`, `NM_zn2`, `NM_xp1`, `NM_xp2`, `NM_xn1`, `NM_xn2`
- **NR1** (2): `NR1_zp1`, `NR1_xp1`
- **NR2** (2): `NR2_xn1`, `NR2_xn2`
- **NR3** (4): `NR3_zp1`, `NR3_zn1`, `NR3_xp1`, `NR3_xp2`
- **NR4** (2): `NR4_zp1`, `NR4_zn1`
- **NR5** (2): `NR5_zp1`, `NR5_zn1`
- **NK1** (4): `NK1_zp1`, `NK1_zn1`, `NK1_xp1`, `NK1_xn1`
- **NK2** (4): `NK2_zp1`, `NK2_zn1`, `NK2_xp1`, `NK2_xn1`
- **NK3** (4): `NK3_zp1`, `NK3_zp2`, `NK3_zn1`, `NK3_zn2`
- **NK4** (2): `NK4_zp1`, `NK4_zp2`
- **NK5** (4): `NK5_zp1`, `NK5_zn1`, `NK5_xp1`, `NK5_xp2`
- **SL1** (8): `SL1_zp1`, `SL1_zp2`, `SL1_zp3`, `SL1_zn1`, `SL1_zn2`, `SL1_zn3`, `SL1_xn1`, `SL1_xn2`
- **SL2a** (2): `SL2a_zp1`, `SL2a_zn1`
- **SL2b** (5): `SL2b_zp1`, `SL2b_zn1`, `SL2b_xn1`, `SL2b_xn2`, `SL2b_xn3`
- **SL2c** (2): `SL2c_zp1`, `SL2c_zn1`
- **SL3** (8): `SL3_zp1`, `SL3_zp2`, `SL3_zn1`, `SL3_zn2`, `SL3_xp1`, `SL3_xp2`, `SL3_xn1`, `SL3_xn2`
- **SH** (4): `SH_zp1`, `SH_zn1`, `SH_xp1`, `SH_xn1`
- **SL5** (4): `SL5_zp1`, `SL5_zn1`, `SL5_xp1`, `SL5_xp2`
- **SL6** (4): `SL6_zp1`, `SL6_zn1`, `SL6_xn1`, `SL6_xn2`
- **SL7** (6): `SL7_zp1`, `SL7_zn1`, `SL7_xp1`, `SL7_xp2`, `SL7_xn1`, `SL7_xn2`
- **SL4** (6): `SL4_zp1`, `SL4_zn1`, `SL4_xp1`, `SL4_xp2`, `SL4_xn1`, `SL4_xn2`
- **SH2** (4): `SH2_zp1`, `SH2_zp2`, `SH2_zn1`, `SH2_zn2`
- **SLONG** (2): `SLONG_xp1`, `SLONG_xp2`
- **SR1** (6): `SR1_zp1`, `SR1_zp2`, `SR1_xp1`, `SR1_xp2`, `SR1_xp3`, `SR1_xp4`
- **SR2** (4): `SR2_zp1`, `SR2_zn1`, `SR2_xn1`, `SR2_xn2`
- **SR3** (6): `SR3_zp1`, `SR3_zn1`, `SR3_xn1`, `SR3_xn2`, `SR3_xn3`, `SR3_xn4`
- **SR4** (4): `SR4_zn1`, `SR4_zn2`, `SR4_xn1`, `SR4_xn2`
- **SD** (14): `SD_zp1`, `SD_zp2`, `SD_zp3`, `SD_zp4`, `SD_zn1`, `SD_zn2`, `SD_zn3`, `SD_zn4`, `SD_xp1`, `SD_xp2`, `SD_xp3`, `SD_xn1`, `SD_xn2`, `SD_xn3`
