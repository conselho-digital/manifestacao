# Cartazes das lojas (mapa Paulista)

Cada vitrine tem uma vaga de cartaz com um número fixo (Cartaz 01, 02...) e um nome interno. No jogo, a vaga mostra um cartaz de exemplo com o número em letras grandes.

No jogo qualquer jogador pode pôr uma imagem pagando: 1ª imagem $2, fica 24 h; antes disso só sai se alguém pagar mais que o valor anterior. O que está abaixo é para imagens FIXAS (que não vencem), postas por arquivo.

**Nome da vaga** = `<prédio>_<lado><número da loja>`. Lado: `zp` = fachada voltada para +z, `zn` = para -z, `xp` = para +x, `xn` = para -x. Ex.: `N1_zn2` = prédio N1, fachada -z, 2ª loja.

## Como pôr uma imagem

1. Imagem 3:2 (ideal 1200 x 800 px), .webp, .jpg ou .png, leve (< 200 KB). O jogo corta para preencher.
2. Salve em `public/posters/` com qualquer nome sem espaços (ex.: `N1_zn2.webp`).
3. Liste em `public/posters/index.json`: `{ "posters": { "N1_zn2": "N1_zn2.webp", "NG_zn1": "promo.jpg" } }`.

As vagas sem imagem continuam com o cartaz de exemplo. Para ver onde fica cada vaga: ande pelo mapa, o número está escrito no cartaz.

## Todas as vagas (253)

No jogo cada cartaz tem um número ("Cartaz 01", "Cartaz 02"...). O nome interno (depois do número) só é usado nos arquivos e no servidor.

- **N2**: 1 = `N2_zp1`, 2 = `N2_zp2`, 3 = `N2_zn1`, 4 = `N2_zn2`, 5 = `N2_xp1`, 6 = `N2_xp2`, 7 = `N2_xp3`, 8 = `N2_xn1`, 9 = `N2_xn2`, 10 = `N2_xn3`
- **N1**: 11 = `N1_zp1`, 12 = `N1_zp2`, 13 = `N1_zp3`, 14 = `N1_zn1`, 15 = `N1_zn2`, 16 = `N1_zn3`, 17 = `N1_xp1`, 18 = `N1_xp2`, 19 = `N1_xp3`, 20 = `N1_xn1`, 21 = `N1_xn2`, 22 = `N1_xn3`
- **NT**: 23 = `NT_zn1`, 24 = `NT_zn2`, 25 = `NT_zn3`, 26 = `NT_xp1`, 27 = `NT_xp2`, 28 = `NT_xp3`, 29 = `NT_xp4`, 30 = `NT_xn1`, 31 = `NT_xn2`, 32 = `NT_xn3`, 33 = `NT_xn4`
- **NG**: 34 = `NG_zp1`, 35 = `NG_zp2`, 36 = `NG_zn1`, 37 = `NG_zn2`, 38 = `NG_xp1`, 39 = `NG_xp2`, 40 = `NG_xp3`
- **NC**: 41 = `NC_zp1`, 42 = `NC_zp2`, 43 = `NC_zn1`, 44 = `NC_zn2`, 45 = `NC_xn1`, 46 = `NC_xn2`, 47 = `NC_xn3`
- **NB1**: 48 = `NB1_zp1`, 49 = `NB1_zp2`, 50 = `NB1_zn1`, 51 = `NB1_zn2`, 52 = `NB1_xp1`, 53 = `NB1_xp2`, 54 = `NB1_xp3`, 55 = `NB1_xn1`, 56 = `NB1_xn2`, 57 = `NB1_xn3`
- **NB2**: 58 = `NB2_zp1`, 59 = `NB2_zn1`, 60 = `NB2_xp1`, 61 = `NB2_xp2`
- **NB3**: 62 = `NB3_zp1`, 63 = `NB3_zp2`
- **H1**: 64 = `H1_zp1`, 65 = `H1_zp2`, 66 = `H1_zn1`, 67 = `H1_zn2`
- **H2**: 68 = `H2_zp1`, 69 = `H2_zp2`, 70 = `H2_zn1`, 71 = `H2_zn2`, 72 = `H2_xn1`, 73 = `H2_xn2`
- **NM**: 74 = `NM_zp1`, 75 = `NM_zp2`, 76 = `NM_zp3`, 77 = `NM_zn1`, 78 = `NM_zn2`, 79 = `NM_zn3`, 80 = `NM_xp1`, 81 = `NM_xp2`, 82 = `NM_xp3`, 83 = `NM_xn1`, 84 = `NM_xn2`, 85 = `NM_xn3`
- **NR1**: 86 = `NR1_zp1`, 87 = `NR1_zp2`, 88 = `NR1_xp1`, 89 = `NR1_xp2`
- **NR2**: 90 = `NR2_xn1`, 91 = `NR2_xn2`, 92 = `NR2_xn3`
- **NR3**: 93 = `NR3_zp1`, 94 = `NR3_zn1`, 95 = `NR3_xp1`, 96 = `NR3_xp2`
- **NR4**: 97 = `NR4_zp1`, 98 = `NR4_zp2`, 99 = `NR4_zn1`, 100 = `NR4_zn2`
- **NR5**: 101 = `NR5_zp1`, 102 = `NR5_zp2`, 103 = `NR5_zn1`, 104 = `NR5_zn2`
- **NK1**: 105 = `NK1_zp1`, 106 = `NK1_zn1`, 107 = `NK1_xp1`, 108 = `NK1_xn1`
- **NK2**: 109 = `NK2_zp1`, 110 = `NK2_zp2`, 111 = `NK2_zn1`, 112 = `NK2_zn2`, 113 = `NK2_xp1`, 114 = `NK2_xp2`, 115 = `NK2_xn1`, 116 = `NK2_xn2`
- **NK3**: 117 = `NK3_zp1`, 118 = `NK3_zp2`, 119 = `NK3_zn1`, 120 = `NK3_zn2`, 121 = `NK3_xp1`, 122 = `NK3_xn1`
- **NK4**: 123 = `NK4_zp1`, 124 = `NK4_zp2`
- **NK5**: 125 = `NK5_zp1`, 126 = `NK5_zn1`, 127 = `NK5_xp1`, 128 = `NK5_xp2`
- **SL1**: 129 = `SL1_zp1`, 130 = `SL1_zp2`, 131 = `SL1_zp3`, 132 = `SL1_zp4`, 133 = `SL1_zn1`, 134 = `SL1_zn2`, 135 = `SL1_zn3`, 136 = `SL1_zn4`, 137 = `SL1_xn1`, 138 = `SL1_xn2`
- **SL2a**: 139 = `SL2a_zp1`, 140 = `SL2a_zp2`, 141 = `SL2a_zn1`, 142 = `SL2a_zn2`
- **SL2b**: 143 = `SL2b_zp1`, 144 = `SL2b_zp2`, 145 = `SL2b_zn1`, 146 = `SL2b_zn2`, 147 = `SL2b_xn1`, 148 = `SL2b_xn2`, 149 = `SL2b_xn3`, 150 = `SL2b_xn4`
- **SL2c**: 151 = `SL2c_zp1`, 152 = `SL2c_zp2`, 153 = `SL2c_zn1`, 154 = `SL2c_zn2`
- **SL3**: 155 = `SL3_zp1`, 156 = `SL3_zp2`, 157 = `SL3_zp3`, 158 = `SL3_zn1`, 159 = `SL3_zn2`, 160 = `SL3_zn3`, 161 = `SL3_xp1`, 162 = `SL3_xp2`, 163 = `SL3_xn1`, 164 = `SL3_xn2`
- **SH**: 165 = `SH_zp1`, 166 = `SH_zp2`, 167 = `SH_zn1`, 168 = `SH_zn2`, 169 = `SH_xp1`, 170 = `SH_xp2`, 171 = `SH_xn1`, 172 = `SH_xn2`
- **SL5**: 173 = `SL5_zp1`, 174 = `SL5_zp2`, 175 = `SL5_zn1`, 176 = `SL5_zn2`, 177 = `SL5_xp1`, 178 = `SL5_xp2`, 179 = `SL5_xp3`
- **SL6**: 180 = `SL6_zp1`, 181 = `SL6_zp2`, 182 = `SL6_zn1`, 183 = `SL6_zn2`, 184 = `SL6_xn1`, 185 = `SL6_xn2`, 186 = `SL6_xn3`
- **SL7**: 187 = `SL7_zp1`, 188 = `SL7_zp2`, 189 = `SL7_zn1`, 190 = `SL7_zn2`, 191 = `SL7_xp1`, 192 = `SL7_xp2`, 193 = `SL7_xp3`, 194 = `SL7_xn1`, 195 = `SL7_xn2`, 196 = `SL7_xn3`
- **SL4**: 197 = `SL4_zp1`, 198 = `SL4_zp2`, 199 = `SL4_zn1`, 200 = `SL4_zn2`, 201 = `SL4_xp1`, 202 = `SL4_xp2`, 203 = `SL4_xp3`, 204 = `SL4_xn1`, 205 = `SL4_xn2`, 206 = `SL4_xn3`
- **SH2**: 207 = `SH2_zp1`, 208 = `SH2_zp2`, 209 = `SH2_zp3`, 210 = `SH2_zn1`, 211 = `SH2_zn2`, 212 = `SH2_zn3`
- **SLONG**: 213 = `SLONG_xp1`, 214 = `SLONG_xp2`, 215 = `SLONG_xp3`
- **SR1**: 216 = `SR1_zp1`, 217 = `SR1_zp2`, 218 = `SR1_xp1`, 219 = `SR1_xp2`, 220 = `SR1_xp3`, 221 = `SR1_xp4`
- **SR2**: 222 = `SR2_zp1`, 223 = `SR2_zn1`, 224 = `SR2_xn1`, 225 = `SR2_xn2`
- **SR3**: 226 = `SR3_zp1`, 227 = `SR3_zp2`, 228 = `SR3_zn1`, 229 = `SR3_zn2`, 230 = `SR3_xn1`, 231 = `SR3_xn2`, 232 = `SR3_xn3`, 233 = `SR3_xn4`, 234 = `SR3_xn5`
- **SR4**: 235 = `SR4_zn1`, 236 = `SR4_zn2`, 237 = `SR4_xn1`, 238 = `SR4_xn2`, 239 = `SR4_xn3`
- **SD**: 240 = `SD_zp1`, 241 = `SD_zp2`, 242 = `SD_zp3`, 243 = `SD_zp4`, 244 = `SD_zn1`, 245 = `SD_zn2`, 246 = `SD_zn3`, 247 = `SD_zn4`, 248 = `SD_xp1`, 249 = `SD_xp2`, 250 = `SD_xp3`, 251 = `SD_xn1`, 252 = `SD_xn2`, 253 = `SD_xn3`
