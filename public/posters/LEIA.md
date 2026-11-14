# Cartazes das lojas (mapa Paulista)

Cada vitrine tem uma vaga de cartaz com um número fixo (Cartaz 01, 02...) e um nome interno. No jogo, a vaga mostra um cartaz de exemplo com o número em letras grandes.

No jogo qualquer jogador pode pôr uma imagem pagando: 1ª imagem $2, fica 24 h; antes disso só sai se alguém pagar mais que o valor anterior. O que está abaixo é para imagens FIXAS (que não vencem), postas por arquivo.

**Nome da vaga** = `<prédio>_<lado><número da loja>`. Lado: `zp` = fachada voltada para +z, `zn` = para -z, `xp` = para +x, `xn` = para -x. Ex.: `N1_zn2` = prédio N1, fachada -z, 2ª loja.

## Como pôr uma imagem

1. Imagem 3:2 (ideal 1200 x 800 px), .webp, .jpg ou .png, leve (< 200 KB). O jogo corta para preencher.
2. Salve em `public/posters/` com qualquer nome sem espaços (ex.: `N1_zn2.webp`).
3. Liste em `public/posters/index.json`: `{ "posters": { "N1_zn2": "N1_zn2.webp", "NG_zn1": "promo.jpg" } }`.

As vagas sem imagem continuam com o cartaz de exemplo. Para ver onde fica cada vaga: ande pelo mapa, o número está escrito no cartaz.

## Todas as vagas (206)

No jogo cada cartaz tem um número ("Cartaz 01", "Cartaz 02"...). O nome interno (depois do ) só é usado nos arquivos e no servidor.

- **N2**: 01 = `N2_zp1`, 02 = `N2_zp2`, 03 = `N2_zn1`, 04 = `N2_zn2`, 05 = `N2_xp1`, 06 = `N2_xp2`, 07 = `N2_xp3`, 08 = `N2_xn1`, 09 = `N2_xn2`, 10 = `N2_xn3`
- **N1**: 11 = `N1_zp1`, 12 = `N1_zp2`, 13 = `N1_zn1`, 14 = `N1_zn2`, 15 = `N1_xp1`, 16 = `N1_xp2`, 17 = `N1_xn1`, 18 = `N1_xn2`
- **NT**: 19 = `NT_zn1`, 20 = `NT_zn2`, 21 = `NT_zn3`, 22 = `NT_xp1`, 23 = `NT_xp2`, 24 = `NT_xp3`, 25 = `NT_xn1`, 26 = `NT_xn2`, 27 = `NT_xn3`
- **NG**: 28 = `NG_zp1`, 29 = `NG_zp2`, 30 = `NG_zn1`, 31 = `NG_zn2`, 32 = `NG_xp1`, 33 = `NG_xp2`, 34 = `NG_xp3`
- **NC**: 35 = `NC_zp1`, 36 = `NC_zp2`, 37 = `NC_zn1`, 38 = `NC_zn2`, 39 = `NC_xn1`, 40 = `NC_xn2`
- **NB1**: 41 = `NB1_zp1`, 42 = `NB1_zn1`, 43 = `NB1_xp1`, 44 = `NB1_xp2`, 45 = `NB1_xn1`, 46 = `NB1_xn2`
- **NB2**: 47 = `NB2_zp1`, 48 = `NB2_zn1`, 49 = `NB2_xp1`
- **NB3**: 50 = `NB3_zp1`
- **H1**: 51 = `H1_zp1`, 52 = `H1_zn1`
- **H2**: 53 = `H2_zp1`, 54 = `H2_zn1`, 55 = `H2_xn1`
- **NM**: 56 = `NM_zp1`, 57 = `NM_zp2`, 58 = `NM_zn1`, 59 = `NM_zn2`, 60 = `NM_xp1`, 61 = `NM_xp2`, 62 = `NM_xp3`, 63 = `NM_xn1`, 64 = `NM_xn2`, 65 = `NM_xn3`
- **NR1**: 66 = `NR1_zp1`, 67 = `NR1_zp2`, 68 = `NR1_xp1`, 69 = `NR1_xp2`
- **NR2**: 70 = `NR2_xn1`, 71 = `NR2_xn2`, 72 = `NR2_xn3`
- **NR3**: 73 = `NR3_zp1`, 74 = `NR3_zn1`, 75 = `NR3_xp1`
- **NR4**: 76 = `NR4_zp1`, 77 = `NR4_zp2`, 78 = `NR4_zn1`, 79 = `NR4_zn2`
- **NR5**: 80 = `NR5_zp1`, 81 = `NR5_zp2`, 82 = `NR5_zn1`, 83 = `NR5_zn2`
- **NK1**: 84 = `NK1_zp1`, 85 = `NK1_zn1`, 86 = `NK1_xp1`, 87 = `NK1_xn1`
- **NK2**: 88 = `NK2_zp1`, 89 = `NK2_zp2`, 90 = `NK2_zn1`, 91 = `NK2_zn2`, 92 = `NK2_xp1`, 93 = `NK2_xp2`, 94 = `NK2_xn1`, 95 = `NK2_xn2`
- **NK3**: 96 = `NK3_zp1`, 97 = `NK3_zp2`, 98 = `NK3_zn1`, 99 = `NK3_zn2`, 100 = `NK3_xp1`, 101 = `NK3_xn1`
- **NK4**: 102 = `NK4_zp1`
- **NK5**: 103 = `NK5_zp1`, 104 = `NK5_zn1`, 105 = `NK5_xp1`
- **SL1**: 106 = `SL1_zp1`, 107 = `SL1_zp2`, 108 = `SL1_zp3`, 109 = `SL1_zn1`, 110 = `SL1_zn2`, 111 = `SL1_zn3`, 112 = `SL1_xn1`, 113 = `SL1_xn2`
- **SL2a**: 114 = `SL2a_zp1`, 115 = `SL2a_zp2`, 116 = `SL2a_zn1`, 117 = `SL2a_zn2`
- **SL2b**: 118 = `SL2b_zp1`, 119 = `SL2b_zp2`, 120 = `SL2b_zn1`, 121 = `SL2b_zn2`, 122 = `SL2b_xn1`, 123 = `SL2b_xn2`, 124 = `SL2b_xn3`
- **SL2c**: 125 = `SL2c_zp1`, 126 = `SL2c_zp2`, 127 = `SL2c_zn1`, 128 = `SL2c_zn2`
- **SL3**: 129 = `SL3_zp1`, 130 = `SL3_zp2`, 131 = `SL3_zn1`, 132 = `SL3_zn2`, 133 = `SL3_xp1`, 134 = `SL3_xp2`, 135 = `SL3_xn1`, 136 = `SL3_xn2`
- **SH**: 137 = `SH_zp1`, 138 = `SH_zn1`, 139 = `SH_xp1`, 140 = `SH_xp2`, 141 = `SH_xn1`, 142 = `SH_xn2`
- **SL5**: 143 = `SL5_zp1`, 144 = `SL5_zp2`, 145 = `SL5_zn1`, 146 = `SL5_zn2`, 147 = `SL5_xp1`, 148 = `SL5_xp2`
- **SL6**: 149 = `SL6_zp1`, 150 = `SL6_zp2`, 151 = `SL6_zn1`, 152 = `SL6_zn2`, 153 = `SL6_xn1`, 154 = `SL6_xn2`
- **SL7**: 155 = `SL7_zp1`, 156 = `SL7_zn1`, 157 = `SL7_xp1`, 158 = `SL7_xp2`, 159 = `SL7_xn1`, 160 = `SL7_xn2`
- **SL4**: 161 = `SL4_zp1`, 162 = `SL4_zp2`, 163 = `SL4_zn1`, 164 = `SL4_zn2`, 165 = `SL4_xp1`, 166 = `SL4_xp2`, 167 = `SL4_xn1`, 168 = `SL4_xn2`
- **SH2**: 169 = `SH2_zp1`, 170 = `SH2_zp2`, 171 = `SH2_zn1`, 172 = `SH2_zn2`
- **SLONG**: 173 = `SLONG_xp1`, 174 = `SLONG_xp2`, 175 = `SLONG_xp3`
- **SR1**: 176 = `SR1_zp1`, 177 = `SR1_zp2`, 178 = `SR1_xp1`, 179 = `SR1_xp2`, 180 = `SR1_xp3`
- **SR2**: 181 = `SR2_zp1`, 182 = `SR2_zn1`, 183 = `SR2_xn1`
- **SR3**: 184 = `SR3_zp1`, 185 = `SR3_zn1`, 186 = `SR3_xn1`, 187 = `SR3_xn2`, 188 = `SR3_xn3`, 189 = `SR3_xn4`, 190 = `SR3_xn5`
- **SR4**: 191 = `SR4_zn1`, 192 = `SR4_zn2`, 193 = `SR4_xn1`, 194 = `SR4_xn2`
- **SD**: 195 = `SD_zp1`, 196 = `SD_zp2`, 197 = `SD_zp3`, 198 = `SD_zn1`, 199 = `SD_zn2`, 200 = `SD_zn3`, 201 = `SD_xp1`, 202 = `SD_xp2`, 203 = `SD_xp3`, 204 = `SD_xn1`, 205 = `SD_xn2`, 206 = `SD_xn3`
