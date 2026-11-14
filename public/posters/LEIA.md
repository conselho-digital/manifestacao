# Cartazes das lojas (mapa Paulista)

Cada vitrine tem uma vaga de cartaz com um número fixo (Cartaz 01, 02...) e um nome interno. No jogo, a vaga mostra um cartaz de exemplo com o número em letras grandes.

No jogo qualquer jogador pode pôr uma imagem pagando: 1ª imagem $2, fica 24 h; antes disso só sai se alguém pagar mais que o valor anterior. O que está abaixo é para imagens FIXAS (que não vencem), postas por arquivo.

**Nome da vaga** = `<prédio>_<lado><número da loja>`. Lado: `zp` = fachada voltada para +z, `zn` = para -z, `xp` = para +x, `xn` = para -x. Ex.: `N1_zn2` = prédio N1, fachada -z, 2ª loja.

## Como pôr uma imagem

1. Imagem 3:2 (ideal 1200 x 800 px), .webp, .jpg ou .png, leve (< 200 KB). O jogo corta para preencher.
2. Salve em `public/posters/` com qualquer nome sem espaços (ex.: `N1_zn2.webp`).
3. Liste em `public/posters/index.json`: `{ "posters": { "N1_zn2": "N1_zn2.webp", "NG_zn1": "promo.jpg" } }`.

As vagas sem imagem continuam com o cartaz de exemplo. Para ver onde fica cada vaga: ande pelo mapa, o número está escrito no cartaz.

## Todas as vagas (217)

No jogo cada cartaz tem um número ("Cartaz 01", "Cartaz 02"...). O nome interno (depois do ) só é usado nos arquivos e no servidor.

- **N2**: 01 = `N2_zp1`, 02 = `N2_zp2`, 03 = `N2_zn1`, 04 = `N2_zn2`, 05 = `N2_xp1`, 06 = `N2_xp2`, 07 = `N2_xp3`, 08 = `N2_xn1`, 09 = `N2_xn2`, 10 = `N2_xn3`
- **N1**: 11 = `N1_zp1`, 12 = `N1_zp2`, 13 = `N1_zn1`, 14 = `N1_zn2`, 15 = `N1_xp1`, 16 = `N1_xp2`, 17 = `N1_xn1`, 18 = `N1_xn2`
- **NT**: 19 = `NT_zn1`, 20 = `NT_zn2`, 21 = `NT_zn3`, 22 = `NT_xp1`, 23 = `NT_xp2`, 24 = `NT_xp3`, 25 = `NT_xn1`, 26 = `NT_xn2`, 27 = `NT_xn3`
- **NG**: 28 = `NG_zp1`, 29 = `NG_zp2`, 30 = `NG_zn1`, 31 = `NG_zn2`, 32 = `NG_xp1`, 33 = `NG_xp2`, 34 = `NG_xp3`
- **NC**: 35 = `NC_zp1`, 36 = `NC_zp2`, 37 = `NC_zn1`, 38 = `NC_zn2`, 39 = `NC_xn1`, 40 = `NC_xn2`
- **NB1**: 41 = `NB1_zp1`, 42 = `NB1_zn1`, 43 = `NB1_xp1`, 44 = `NB1_xp2`, 45 = `NB1_xn1`, 46 = `NB1_xn2`
- **NB2**: 47 = `NB2_zp1`, 48 = `NB2_zn1`, 49 = `NB2_xp1`
- **NB3**: 50 = `NB3_zp1`
- **H1**: 51 = `H1_zp1`, 52 = `H1_zp2`, 53 = `H1_zn1`, 54 = `H1_zn2`
- **H2**: 55 = `H2_zp1`, 56 = `H2_zp2`, 57 = `H2_zn1`, 58 = `H2_zn2`, 59 = `H2_xn1`, 60 = `H2_xn2`
- **NM**: 61 = `NM_zp1`, 62 = `NM_zp2`, 63 = `NM_zn1`, 64 = `NM_zn2`, 65 = `NM_xp1`, 66 = `NM_xp2`, 67 = `NM_xp3`, 68 = `NM_xn1`, 69 = `NM_xn2`, 70 = `NM_xn3`
- **NR1**: 71 = `NR1_zp1`, 72 = `NR1_zp2`, 73 = `NR1_xp1`, 74 = `NR1_xp2`
- **NR2**: 75 = `NR2_xn1`, 76 = `NR2_xn2`, 77 = `NR2_xn3`
- **NR3**: 78 = `NR3_zp1`, 79 = `NR3_zn1`, 80 = `NR3_xp1`
- **NR4**: 81 = `NR4_zp1`, 82 = `NR4_zp2`, 83 = `NR4_zn1`, 84 = `NR4_zn2`
- **NR5**: 85 = `NR5_zp1`, 86 = `NR5_zp2`, 87 = `NR5_zn1`, 88 = `NR5_zn2`
- **NK1**: 89 = `NK1_zp1`, 90 = `NK1_zn1`, 91 = `NK1_xp1`, 92 = `NK1_xn1`
- **NK2**: 93 = `NK2_zp1`, 94 = `NK2_zp2`, 95 = `NK2_zn1`, 96 = `NK2_zn2`, 97 = `NK2_xp1`, 98 = `NK2_xp2`, 99 = `NK2_xn1`, 100 = `NK2_xn2`
- **NK3**: 101 = `NK3_zp1`, 102 = `NK3_zp2`, 103 = `NK3_zn1`, 104 = `NK3_zn2`, 105 = `NK3_xp1`, 106 = `NK3_xn1`
- **NK4**: 107 = `NK4_zp1`
- **NK5**: 108 = `NK5_zp1`, 109 = `NK5_zn1`, 110 = `NK5_xp1`
- **SL1**: 111 = `SL1_zp1`, 112 = `SL1_zp2`, 113 = `SL1_zp3`, 114 = `SL1_zn1`, 115 = `SL1_zn2`, 116 = `SL1_zn3`, 117 = `SL1_xn1`, 118 = `SL1_xn2`
- **SL2a**: 119 = `SL2a_zp1`, 120 = `SL2a_zp2`, 121 = `SL2a_zn1`, 122 = `SL2a_zn2`
- **SL2b**: 123 = `SL2b_zp1`, 124 = `SL2b_zp2`, 125 = `SL2b_zn1`, 126 = `SL2b_zn2`, 127 = `SL2b_xn1`, 128 = `SL2b_xn2`, 129 = `SL2b_xn3`
- **SL2c**: 130 = `SL2c_zp1`, 131 = `SL2c_zp2`, 132 = `SL2c_zn1`, 133 = `SL2c_zn2`
- **SL3**: 134 = `SL3_zp1`, 135 = `SL3_zp2`, 136 = `SL3_zp3`, 137 = `SL3_zn1`, 138 = `SL3_zn2`, 139 = `SL3_zn3`, 140 = `SL3_xp1`, 141 = `SL3_xp2`, 142 = `SL3_xn1`, 143 = `SL3_xn2`
- **SH**: 144 = `SH_zp1`, 145 = `SH_zp2`, 146 = `SH_zn1`, 147 = `SH_zn2`, 148 = `SH_xp1`, 149 = `SH_xp2`, 150 = `SH_xn1`, 151 = `SH_xn2`
- **SL5**: 152 = `SL5_zp1`, 153 = `SL5_zp2`, 154 = `SL5_zn1`, 155 = `SL5_zn2`, 156 = `SL5_xp1`, 157 = `SL5_xp2`
- **SL6**: 158 = `SL6_zp1`, 159 = `SL6_zp2`, 160 = `SL6_zn1`, 161 = `SL6_zn2`, 162 = `SL6_xn1`, 163 = `SL6_xn2`
- **SL7**: 164 = `SL7_zp1`, 165 = `SL7_zn1`, 166 = `SL7_xp1`, 167 = `SL7_xp2`, 168 = `SL7_xn1`, 169 = `SL7_xn2`
- **SL4**: 170 = `SL4_zp1`, 171 = `SL4_zp2`, 172 = `SL4_zn1`, 173 = `SL4_zn2`, 174 = `SL4_xp1`, 175 = `SL4_xp2`, 176 = `SL4_xp3`, 177 = `SL4_xn1`, 178 = `SL4_xn2`, 179 = `SL4_xn3`
- **SH2**: 180 = `SH2_zp1`, 181 = `SH2_zp2`, 182 = `SH2_zn1`, 183 = `SH2_zn2`
- **SLONG**: 184 = `SLONG_xp1`, 185 = `SLONG_xp2`, 186 = `SLONG_xp3`
- **SR1**: 187 = `SR1_zp1`, 188 = `SR1_zp2`, 189 = `SR1_xp1`, 190 = `SR1_xp2`, 191 = `SR1_xp3`
- **SR2**: 192 = `SR2_zp1`, 193 = `SR2_zn1`, 194 = `SR2_xn1`
- **SR3**: 195 = `SR3_zp1`, 196 = `SR3_zn1`, 197 = `SR3_xn1`, 198 = `SR3_xn2`, 199 = `SR3_xn3`, 200 = `SR3_xn4`, 201 = `SR3_xn5`
- **SR4**: 202 = `SR4_zn1`, 203 = `SR4_zn2`, 204 = `SR4_xn1`, 205 = `SR4_xn2`
- **SD**: 206 = `SD_zp1`, 207 = `SD_zp2`, 208 = `SD_zp3`, 209 = `SD_zn1`, 210 = `SD_zn2`, 211 = `SD_zn3`, 212 = `SD_xp1`, 213 = `SD_xp2`, 214 = `SD_xp3`, 215 = `SD_xn1`, 216 = `SD_xn2`, 217 = `SD_xn3`
