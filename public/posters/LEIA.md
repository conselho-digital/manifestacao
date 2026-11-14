# Cartazes das lojas (mapa Paulista)

Cada vitrine tem uma vaga de cartaz com um número fixo (Cartaz 01, 02...) e um nome interno. No jogo, a vaga mostra um cartaz de exemplo com o número em letras grandes.

No jogo qualquer jogador pode pôr uma imagem pagando: 1ª imagem $2, fica 24 h; antes disso só sai se alguém pagar mais que o valor anterior. O que está abaixo é para imagens FIXAS (que não vencem), postas por arquivo.

**Nome da vaga** = `<prédio>_<lado><número da loja>`. Lado: `zp` = fachada voltada para +z, `zn` = para -z, `xp` = para +x, `xn` = para -x. Ex.: `N1_zn2` = prédio N1, fachada -z, 2ª loja.

## Como pôr uma imagem

1. Imagem 3:2 (ideal 1200 x 800 px), .webp, .jpg ou .png, leve (< 200 KB). O jogo corta para preencher.
2. Salve em `public/posters/` com qualquer nome sem espaços (ex.: `N1_zn2.webp`).
3. Liste em `public/posters/index.json`: `{ "posters": { "N1_zn2": "N1_zn2.webp", "NG_zn1": "promo.jpg" } }`.

As vagas sem imagem continuam com o cartaz de exemplo. Para ver onde fica cada vaga: ande pelo mapa, o número está escrito no cartaz.

## Todas as vagas (181)

No jogo cada cartaz tem um número ("Cartaz 01", "Cartaz 02"...). O nome interno (a 2ª coluna) só é usado nos arquivos e no servidor.

- **N2**: 01 = `N2_zp1`, 02 = `N2_zn1`, 03 = `N2_xp1`, 04 = `N2_xp2`, 05 = `N2_xn1`, 06 = `N2_xn2`
- **N1**: 07 = `N1_zp1`, 08 = `N1_zp2`, 09 = `N1_zn1`, 10 = `N1_zn2`, 11 = `N1_xp1`, 12 = `N1_xp2`, 13 = `N1_xn1`, 14 = `N1_xn2`
- **NT**: 15 = `NT_zn1`, 16 = `NT_zn2`, 17 = `NT_zn3`, 18 = `NT_xp1`, 19 = `NT_xp2`, 20 = `NT_xp3`, 21 = `NT_xp4`, 22 = `NT_xn1`, 23 = `NT_xn2`, 24 = `NT_xn3`, 25 = `NT_xn4`
- **NG**: 26 = `NG_zp1`, 27 = `NG_zp2`, 28 = `NG_zn1`, 29 = `NG_zn2`, 30 = `NG_xp1`, 31 = `NG_xp2`, 32 = `NG_xp3`
- **NC**: 33 = `NC_zp1`, 34 = `NC_zp2`, 35 = `NC_zn1`, 36 = `NC_zn2`, 37 = `NC_xn1`, 38 = `NC_xn2`
- **NB1**: 39 = `NB1_zp1`, 40 = `NB1_zn1`, 41 = `NB1_xp1`, 42 = `NB1_xp2`, 43 = `NB1_xn1`, 44 = `NB1_xn2`
- **NB2**: 45 = `NB2_zp1`, 46 = `NB2_zn1`, 47 = `NB2_xp1`, 48 = `NB2_xp2`
- **NB3**: 49 = `NB3_zp1`
- **H1**: 50 = `H1_zp1`, 51 = `H1_zn1`
- **H2**: 52 = `H2_zp1`, 53 = `H2_zn1`, 54 = `H2_xn1`
- **NM**: 55 = `NM_zp1`, 56 = `NM_zp2`, 57 = `NM_zn1`, 58 = `NM_zn2`, 59 = `NM_xp1`, 60 = `NM_xp2`, 61 = `NM_xn1`, 62 = `NM_xn2`
- **NR1**: 63 = `NR1_zp1`, 64 = `NR1_xp1`
- **NR2**: 65 = `NR2_xn1`, 66 = `NR2_xn2`
- **NR3**: 67 = `NR3_zp1`, 68 = `NR3_zn1`, 69 = `NR3_xp1`, 70 = `NR3_xp2`
- **NR4**: 71 = `NR4_zp1`, 72 = `NR4_zn1`
- **NR5**: 73 = `NR5_zp1`, 74 = `NR5_zn1`
- **NK1**: 75 = `NK1_zp1`, 76 = `NK1_zn1`, 77 = `NK1_xp1`, 78 = `NK1_xn1`
- **NK2**: 79 = `NK2_zp1`, 80 = `NK2_zn1`, 81 = `NK2_xp1`, 82 = `NK2_xn1`
- **NK3**: 83 = `NK3_zp1`, 84 = `NK3_zp2`, 85 = `NK3_zn1`, 86 = `NK3_zn2`
- **NK4**: 87 = `NK4_zp1`, 88 = `NK4_zp2`
- **NK5**: 89 = `NK5_zp1`, 90 = `NK5_zn1`, 91 = `NK5_xp1`, 92 = `NK5_xp2`
- **SL1**: 93 = `SL1_zp1`, 94 = `SL1_zp2`, 95 = `SL1_zp3`, 96 = `SL1_zn1`, 97 = `SL1_zn2`, 98 = `SL1_zn3`, 99 = `SL1_xn1`, 100 = `SL1_xn2`
- **SL2a**: 101 = `SL2a_zp1`, 102 = `SL2a_zn1`
- **SL2b**: 103 = `SL2b_zp1`, 104 = `SL2b_zn1`, 105 = `SL2b_xn1`, 106 = `SL2b_xn2`, 107 = `SL2b_xn3`
- **SL2c**: 108 = `SL2c_zp1`, 109 = `SL2c_zn1`
- **SL3**: 110 = `SL3_zp1`, 111 = `SL3_zp2`, 112 = `SL3_zn1`, 113 = `SL3_zn2`, 114 = `SL3_xp1`, 115 = `SL3_xp2`, 116 = `SL3_xn1`, 117 = `SL3_xn2`
- **SH**: 118 = `SH_zp1`, 119 = `SH_zn1`, 120 = `SH_xp1`, 121 = `SH_xn1`
- **SL5**: 122 = `SL5_zp1`, 123 = `SL5_zn1`, 124 = `SL5_xp1`, 125 = `SL5_xp2`
- **SL6**: 126 = `SL6_zp1`, 127 = `SL6_zn1`, 128 = `SL6_xn1`, 129 = `SL6_xn2`
- **SL7**: 130 = `SL7_zp1`, 131 = `SL7_zn1`, 132 = `SL7_xp1`, 133 = `SL7_xp2`, 134 = `SL7_xn1`, 135 = `SL7_xn2`
- **SL4**: 136 = `SL4_zp1`, 137 = `SL4_zn1`, 138 = `SL4_xp1`, 139 = `SL4_xp2`, 140 = `SL4_xn1`, 141 = `SL4_xn2`
- **SH2**: 142 = `SH2_zp1`, 143 = `SH2_zp2`, 144 = `SH2_zn1`, 145 = `SH2_zn2`
- **SLONG**: 146 = `SLONG_xp1`, 147 = `SLONG_xp2`
- **SR1**: 148 = `SR1_zp1`, 149 = `SR1_zp2`, 150 = `SR1_xp1`, 151 = `SR1_xp2`, 152 = `SR1_xp3`, 153 = `SR1_xp4`
- **SR2**: 154 = `SR2_zp1`, 155 = `SR2_zn1`, 156 = `SR2_xn1`, 157 = `SR2_xn2`
- **SR3**: 158 = `SR3_zp1`, 159 = `SR3_zn1`, 160 = `SR3_xn1`, 161 = `SR3_xn2`, 162 = `SR3_xn3`, 163 = `SR3_xn4`
- **SR4**: 164 = `SR4_zn1`, 165 = `SR4_zn2`, 166 = `SR4_xn1`, 167 = `SR4_xn2`
- **SD**: 168 = `SD_zp1`, 169 = `SD_zp2`, 170 = `SD_zp3`, 171 = `SD_zp4`, 172 = `SD_zn1`, 173 = `SD_zn2`, 174 = `SD_zn3`, 175 = `SD_zn4`, 176 = `SD_xp1`, 177 = `SD_xp2`, 178 = `SD_xp3`, 179 = `SD_xn1`, 180 = `SD_xn2`, 181 = `SD_xn3`
