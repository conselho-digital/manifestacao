# Cartazes das lojas (mapa Paulista)

Cada vitrine tem uma vaga de cartaz com um número fixo (Cartaz 01, 02...) e um nome interno. No jogo, a vaga mostra um cartaz de exemplo com o número em letras grandes.

No jogo qualquer jogador pode pôr uma imagem pagando: 1ª imagem $2, fica 24 h; antes disso só sai se alguém pagar mais que o valor anterior. O que está abaixo é para imagens FIXAS (que não vencem), postas por arquivo.

**Nome da vaga** = `<prédio>_<lado><número da loja>`. Lado: `zp` = fachada voltada para +z, `zn` = para -z, `xp` = para +x, `xn` = para -x. Ex.: `N1_zn2` = prédio N1, fachada -z, 2ª loja.

## Como pôr uma imagem

1. Imagem 3:2 (ideal 1200 x 800 px), .webp, .jpg ou .png, leve (< 200 KB). O jogo corta para preencher.
2. Salve em `public/posters/` com qualquer nome sem espaços (ex.: `N1_zn2.webp`).
3. Liste em `public/posters/index.json`: `{ "posters": { "N1_zn2": "N1_zn2.webp", "NG_zn1": "promo.jpg" } }`.

As vagas sem imagem continuam com o cartaz de exemplo. Para ver onde fica cada vaga: ande pelo mapa, o número está escrito no cartaz.

## Todas as vagas (176)

No jogo cada cartaz tem um número ("Cartaz 01", "Cartaz 02"...). O nome interno (depois do ) só é usado nos arquivos e no servidor.

- **N2**: 01 = `N2_zp1`, 02 = `N2_zp2`, 03 = `N2_zn1`, 04 = `N2_zn2`, 05 = `N2_xp1`, 06 = `N2_xp2`, 07 = `N2_xp3`, 08 = `N2_xn1`, 09 = `N2_xn2`, 10 = `N2_xn3`
- **N1**: 11 = `N1_zp1`, 12 = `N1_zp2`, 13 = `N1_zn1`, 14 = `N1_zn2`, 15 = `N1_xp1`, 16 = `N1_xp2`, 17 = `N1_xn1`, 18 = `N1_xn2`
- **NT**: 19 = `NT_zn1`, 20 = `NT_zn2`, 21 = `NT_zn3`, 22 = `NT_xp1`, 23 = `NT_xp2`, 24 = `NT_xp3`, 25 = `NT_xn1`, 26 = `NT_xn2`, 27 = `NT_xn3`
- **NG**: 28 = `NG_zp1`, 29 = `NG_zp2`, 30 = `NG_zn1`, 31 = `NG_zn2`, 32 = `NG_xp1`, 33 = `NG_xp2`, 34 = `NG_xp3`
- **NC**: 35 = `NC_zp1`, 36 = `NC_zp2`, 37 = `NC_zn1`, 38 = `NC_zn2`, 39 = `NC_xn1`, 40 = `NC_xn2`
- **NB1**: 41 = `NB1_zp1`, 42 = `NB1_zn1`, 43 = `NB1_xp1`, 44 = `NB1_xp2`, 45 = `NB1_xn1`, 46 = `NB1_xn2`
- **NB2**: 47 = `NB2_zp1`, 48 = `NB2_zn1`, 49 = `NB2_xp1`
- **NB3**: 50 = `NB3_zp1`
- **NM**: 51 = `NM_zp1`, 52 = `NM_zp2`, 53 = `NM_zn1`, 54 = `NM_zn2`, 55 = `NM_xp1`, 56 = `NM_xp2`, 57 = `NM_xp3`, 58 = `NM_xn1`, 59 = `NM_xn2`, 60 = `NM_xn3`
- **NR1**: 61 = `NR1_zp1`, 62 = `NR1_zp2`, 63 = `NR1_xp1`, 64 = `NR1_xp2`
- **NR2**: 65 = `NR2_xn1`, 66 = `NR2_xn2`, 67 = `NR2_xn3`
- **NR3**: 68 = `NR3_zp1`, 69 = `NR3_zn1`, 70 = `NR3_xp1`
- **NR4**: 71 = `NR4_zp1`, 72 = `NR4_zp2`, 73 = `NR4_zn1`, 74 = `NR4_zn2`
- **NR5**: 75 = `NR5_zp1`, 76 = `NR5_zp2`, 77 = `NR5_zn1`, 78 = `NR5_zn2`
- **NK1**: 79 = `NK1_zp1`, 80 = `NK1_zn1`, 81 = `NK1_xp1`, 82 = `NK1_xn1`
- **NK2**: 83 = `NK2_zp1`, 84 = `NK2_zp2`, 85 = `NK2_zn1`, 86 = `NK2_zn2`, 87 = `NK2_xp1`, 88 = `NK2_xp2`, 89 = `NK2_xn1`, 90 = `NK2_xn2`
- **NK3**: 91 = `NK3_zp1`, 92 = `NK3_zp2`, 93 = `NK3_zn1`, 94 = `NK3_zn2`, 95 = `NK3_xp1`, 96 = `NK3_xn1`
- **NK4**: 97 = `NK4_zp1`
- **NK5**: 98 = `NK5_zp1`, 99 = `NK5_zn1`, 100 = `NK5_xp1`
- **SL1**: 101 = `SL1_zp1`, 102 = `SL1_zp2`, 103 = `SL1_zp3`, 104 = `SL1_zn1`, 105 = `SL1_zn2`, 106 = `SL1_zn3`, 107 = `SL1_xn1`, 108 = `SL1_xn2`
- **SL2a**: 109 = `SL2a_zp1`, 110 = `SL2a_zp2`, 111 = `SL2a_zn1`, 112 = `SL2a_zn2`
- **SL2b**: 113 = `SL2b_zp1`, 114 = `SL2b_zp2`, 115 = `SL2b_zn1`, 116 = `SL2b_zn2`, 117 = `SL2b_xn1`, 118 = `SL2b_xn2`, 119 = `SL2b_xn3`
- **SL2c**: 120 = `SL2c_zp1`, 121 = `SL2c_zp2`, 122 = `SL2c_zn1`, 123 = `SL2c_zn2`
- **SL5**: 124 = `SL5_zp1`, 125 = `SL5_zp2`, 126 = `SL5_zn1`, 127 = `SL5_zn2`, 128 = `SL5_xp1`, 129 = `SL5_xp2`
- **SL6**: 130 = `SL6_zp1`, 131 = `SL6_zp2`, 132 = `SL6_zn1`, 133 = `SL6_zn2`, 134 = `SL6_xn1`, 135 = `SL6_xn2`
- **SL7**: 136 = `SL7_zp1`, 137 = `SL7_zn1`, 138 = `SL7_xp1`, 139 = `SL7_xp2`, 140 = `SL7_xn1`, 141 = `SL7_xn2`
- **SH2**: 142 = `SH2_zp1`, 143 = `SH2_zp2`, 144 = `SH2_zn1`, 145 = `SH2_zn2`
- **SR1**: 146 = `SR1_zp1`, 147 = `SR1_zp2`, 148 = `SR1_xp1`, 149 = `SR1_xp2`, 150 = `SR1_xp3`
- **SR2**: 151 = `SR2_zp1`, 152 = `SR2_zn1`, 153 = `SR2_xn1`
- **SR3**: 154 = `SR3_zp1`, 155 = `SR3_zn1`, 156 = `SR3_xn1`, 157 = `SR3_xn2`, 158 = `SR3_xn3`, 159 = `SR3_xn4`, 160 = `SR3_xn5`
- **SR4**: 161 = `SR4_zn1`, 162 = `SR4_zn2`, 163 = `SR4_xn1`, 164 = `SR4_xn2`
- **SD**: 165 = `SD_zp1`, 166 = `SD_zp2`, 167 = `SD_zp3`, 168 = `SD_zn1`, 169 = `SD_zn2`, 170 = `SD_zn3`, 171 = `SD_xp1`, 172 = `SD_xp2`, 173 = `SD_xp3`, 174 = `SD_xn1`, 175 = `SD_xn2`, 176 = `SD_xn3`
