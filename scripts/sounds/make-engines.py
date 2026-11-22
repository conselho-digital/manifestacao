#!/usr/bin/env python3
"""Gera os sons de motor do jogo (um conjunto DIFERENTE por veículo), tudo sintetizado aqui, sem gravações de fora.

Uso:  python3 scripts/sounds/make-engines.py <pasta de saída> [veículo ...]
Para cada veículo grava <nome>-start.mp3 (partida), <nome>-idle.mp3 (marcha lenta, loop) e <nome>-rev.mp3 (aceleração, loop).
Precisa de numpy e do ffmpeg (libmp3lame). Os laços são periódicos (ciclos inteiros do motor, convolução circular): sem estalo na emenda.

Modelo: cada explosão dispara um "pulso" (batida grave + ressonâncias do escapamento + um sopro de ruído) e os cilindros disparam
em ângulos diferentes dentro do ciclo de 720° (V-twin da Harley: 0° e 315°; V8: pancadas desiguais; 6 em linha: lisos, etc.).
Depois entram o chiado de admissão, o tique mecânico, saturação (tanh) e um passa-baixa (o abafador).
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

FS = 32000
rng = np.random.default_rng(7)


def kernel(spec, n):
    """Resposta de UMA explosão: ressonâncias do escapamento + batida grave."""
    t = np.arange(n) / FS
    k = np.zeros(n)
    for f, tau, a in spec['res']:
        k += a * np.exp(-t / tau) * np.sin(2 * np.pi * f * t + 0.6)
    k += spec.get('thump', 1.0) * np.exp(-t / 0.012) * np.sin(2 * np.pi * spec.get('thumpf', 55) * t)
    return k


def noise_burst(spec, n):
    """Sopro curto da explosão (ruído filtrado), diferente a cada vez."""
    t = np.arange(n) / FS
    x = rng.standard_normal(n) * np.exp(-t / spec.get('ntau', 0.006))
    return x


def lowpass(x, fc, order=3):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / FS)
    return np.fft.irfft(X / (1 + (f / fc) ** (2 * order)), len(x))


def highpass(x, fc):
    return x - lowpass(x, fc, 1)


def render(spec, times, amps, n, circular):
    """Soma os pulsos nos instantes `times` (s). circular: o sinal dá a volta (laço sem emenda)."""
    klen = int(0.09 * FS)
    imp = np.zeros(n)
    nz = np.zeros(n)
    nb = int(0.02 * FS)
    for tm, a in zip(times, amps):
        i = int(round(tm * FS))
        if circular:
            i %= n
        elif i >= n:
            continue
        imp[i] += a
        b = noise_burst(spec, nb) * a * spec.get('noise', 0.3)
        idx = (np.arange(nb) + i) % n if circular else np.arange(i, min(n, i + nb))
        nz[idx] += b[: len(idx)]
    m = n if circular else n + klen
    K = np.fft.rfft(kernel(spec, klen), m)
    body = np.fft.irfft(np.fft.rfft(imp, m) * K, m)
    if circular:
        out = body
    else:
        out = body[:n]
    out = out + nz
    if spec.get('tick', 0) > 0:  # tique mecânico (diesel/válvulas): estalos agudos junto de cada explosão
        tk = np.zeros(n)
        for tm, a in zip(times, amps):
            i = int(round(tm * FS))
            if circular:
                i %= n
            if 0 <= i < n - 40 or circular:
                idx = (np.arange(30) + i) % n if circular else np.arange(i, min(n, i + 30))
                tk[idx] += rng.standard_normal(len(idx)) * a * np.exp(-np.arange(len(idx)) / 6)
        out = out + spec['tick'] * highpass(tk, 2500)
    return out


def finish(spec, x, circular_fc=None):
    x = np.tanh(x * spec.get('drive', 1.5) / (np.max(np.abs(x)) + 1e-9))
    x = lowpass(x, spec.get('lp', 4000))
    x = highpass(x, spec.get('hp', 28))
    return x


def loop(spec, rpm, min_dur):
    """Laço periódico: `k` ciclos de motor (720°) no rpm dado, com variação de amplitude entre explosões."""
    cyc = int(round(FS * 120 / rpm))
    k = max(2, int(np.ceil(min_dur * FS / cyc)))
    n = cyc * k
    times, amps = [], []
    for c in range(k):
        for ang, a in spec['fire']:
            jit = 1 + spec.get('jit', 0.12) * rng.standard_normal()
            tj = (c * cyc + ang / 720 * cyc) / FS + spec.get('tjit', 0.0006) * rng.standard_normal()
            times.append(tj)
            amps.append(a * jit)
    x = render(spec, times, amps, n, True)
    t = np.arange(n) / FS
    fire = rpm / 60 * len(spec['fire']) / 2
    # chiado de admissão / turbina: seno em múltiplo exato da frequência do ciclo (cabe em número inteiro de voltas no laço)
    cyc_hz = rpm / 120
    for mult, a in spec.get('whine', []):
        h = max(1, round(mult * fire / cyc_hz))
        x = x + a * np.max(np.abs(x)) * np.sin(2 * np.pi * h * cyc_hz * k / k * t)
    # "caça" da marcha lenta / respiração do motor: modulação lenta que cabe nos k ciclos
    wob = spec.get('wobble', 0.0)
    if wob > 0:
        x = x * (1 + wob * np.sin(2 * np.pi * max(1, k // 2) * t / (n / FS)))
    return finish(spec, x)


def start_sound(spec, idle_rpm):
    """Partida: motor de arranque girando (zumbido + batidas fracas), o motor pega aos trancos e assenta na marcha lenta."""
    dur = spec.get('start_dur', 1.5)
    n = int(dur * FS)
    t = np.arange(n) / FS
    crank_end = spec.get('crank', 0.7)
    # rpm ao longo do tempo: ~220 girando no arranque, pega e sobe até 1,5x a marcha lenta, assenta
    rpm = np.where(t < crank_end, 220 + 40 * t / crank_end, 0.0)
    catch = np.clip((t - crank_end) / 0.35, 0, 1)
    settle = np.clip((t - crank_end - 0.35) / 0.35, 0, 1)
    r_after = idle_rpm * (0.45 + 1.05 * catch) * (1 - 0.33 * settle)
    rpm = np.where(t < crank_end, rpm, r_after)
    ph = np.cumsum(rpm / 120) / FS  # ciclos (720°) acumulados
    ncyl = len(spec['fire'])
    times, amps = [], []
    for c in range(int(ph[-1]) + 1):
        for ang, a in spec['fire']:
            target = c + ang / 720
            idx = int(np.searchsorted(ph, target))
            if idx >= n:
                continue
            during_crank = idx / FS < crank_end
            amp = a * (0.25 if during_crank else (0.5 + 0.5 * catch[min(n - 1, idx)]))
            amp *= 1 + 0.3 * rng.standard_normal() * (1 - settle[min(n - 1, idx)])
            times.append(idx / FS)
            amps.append(amp)
    x = render(spec, times, amps, n, False)
    # motor de arranque: zumbido com engrenagem (harmônicos) enquanto gira, some quando o motor pega
    sw = np.where(t < crank_end, 1.0, np.exp(-(t - crank_end) / 0.12))
    f0 = 95 + 25 * np.clip(t / crank_end, 0, 1)
    ph2 = 2 * np.pi * np.cumsum(f0) / FS
    starter = (np.sin(ph2) + 0.5 * np.sin(2 * ph2) + 0.3 * np.sin(5 * ph2)) * (1 + 0.35 * np.sin(2 * np.pi * 9 * t)) * sw
    x = x / (np.max(np.abs(x)) + 1e-9) + 0.22 * starter
    x = finish(spec, x)
    fade = int(0.02 * FS)
    x[:fade] *= np.linspace(0, 1, fade)
    x[-fade:] *= np.linspace(1, 0, fade)
    return x


def save(x, path):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.9
    wav = Path(path).with_suffix('.wav')
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(FS)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '96k', '-ar', str(FS), '-ac', '1', str(path)], check=True)
    wav.unlink()


# ---- um motor por veículo -------------------------------------------------------------------------
# fire: (ângulo no ciclo de 720°, força); res: (Hz, decaimento s, força) do escapamento; idle/rev: rpm do laço de marcha lenta e do laço de aceleração
# (o jogo muda o tom do laço de aceleração por playbackRate, do giro de marcha lenta ao topo).
def even(n, amps=None):
    return [(720 * i / n, (amps[i % len(amps)] if amps else 1.0)) for i in range(n)]


ENGINES = {
    # VW Gol 1.0 (4 cilindros pequeno): zumbido seco e agudo de escapamento curto, com chiado de admissão
    'gol': dict(fire=even(4, [1, 0.8, 0.95, 0.75]), res=[(380, 0.016, 0.8), (820, 0.010, 0.55), (1500, 0.006, 0.25)], thump=0.5, thumpf=70,
                noise=0.25, tick=0.12, drive=2.2, lp=3200, hp=45, idle=900, rev=2600, whine=[(4, 0.05)], jit=0.10, vol=1.0, start_dur=1.3, crank=0.6),
    # Chevrolet Opala (6 em linha): grave, redondo e liso, rosnado de seis explosões por volta
    'clover': dict(fire=even(6, [1, 0.9, 1, 0.9, 1, 0.9]), res=[(140, 0.040, 1.0), (300, 0.024, 0.7), (620, 0.012, 0.35)], thump=1.1, thumpf=48,
                   noise=0.22, tick=0.03, drive=1.9, lp=2200, hp=28, idle=760, rev=2300, whine=[], jit=0.07, vol=1.0, start_dur=1.6, crank=0.8, wobble=0.04),
    # Buffalo (muscle V8 de cross-plane): pancadas desiguais, borbulhante e muito grave
    'buffalo': dict(fire=[(0, 1.0), (90, 0.7), (180, 0.95), (270, 0.55), (360, 1.0), (450, 0.75), (540, 0.9), (630, 0.6)],
                    res=[(95, 0.060, 1.0), (190, 0.036, 0.8), (400, 0.020, 0.45)], thump=1.5, thumpf=42, noise=0.4, ntau=0.009, tick=0.02, drive=2.6, lp=1900, hp=24,
                    idle=640, rev=2100, whine=[], jit=0.16, tjit=0.0015, vol=1.0, start_dur=1.7, crank=0.85, wobble=0.07),
    # Renault Duster (4 cilindros 1.6 / viatura): rouco e abafado, mais mole que o Gol, com um tique de válvulas
    'duster': dict(fire=even(4, [1, 0.95, 1, 0.9]), res=[(230, 0.026, 0.9), (520, 0.016, 0.55), (1100, 0.008, 0.2)], thump=0.9, thumpf=60,
                   noise=0.3, tick=0.2, drive=1.7, lp=2400, hp=35, idle=800, rev=2300, whine=[(3, 0.03)], jit=0.09, vol=1.0, start_dur=1.4, crank=0.7),
    # Harley-Davidson (V-twin a 45°): "potato-potato", duas pancadas gordas com intervalo desigual (315°/405°)
    'harley': dict(fire=[(0, 1.0), (315, 0.85)], res=[(110, 0.055, 1.0), (240, 0.030, 0.7), (520, 0.014, 0.35)], thump=1.6, thumpf=45, noise=0.35, ntau=0.01,
                   tick=0.04, drive=2.8, lp=2200, hp=30, idle=900, rev=2500, whine=[], jit=0.10, tjit=0.0012, vol=1.0, start_dur=1.5, crank=0.7, wobble=0.05),
    # Triumph (3 cilindros): ronco rouco e "uivo" de três tempos, médio-agudo
    'triumph': dict(fire=even(3, [1, 0.92, 0.96]), res=[(210, 0.026, 0.9), (560, 0.014, 0.65), (1250, 0.008, 0.35)], thump=0.8, thumpf=62, noise=0.3,
                    tick=0.06, drive=2.4, lp=3600, hp=40, idle=1000, rev=3200, whine=[(2, 0.04)], jit=0.08, vol=1.0, start_dur=1.2, crank=0.55),
    # BMW S1000 (4 em linha de alta rotação): agudo, liso e limpo, com chiado de turbina de admissão
    'bmw': dict(fire=even(4, [1, 1, 1, 1]), res=[(520, 0.014, 0.8), (1300, 0.008, 0.6), (2600, 0.005, 0.35)], thump=0.35, thumpf=90, noise=0.18,
                tick=0.05, drive=1.9, lp=5200, hp=70, idle=1250, rev=3600, whine=[(6, 0.09), (10, 0.04)], jit=0.04, tjit=0.0003, vol=1.0, start_dur=1.1, crank=0.5),
    # Suzuki GSX-R600 (4 em linha gritando): mais metálico e rasgado que a BMW, giro altíssimo
    'suzuki': dict(fire=even(4, [1, 0.9, 1, 0.9]), res=[(700, 0.012, 0.8), (1700, 0.007, 0.65), (3400, 0.004, 0.4)], thump=0.3, thumpf=100, noise=0.28,
                   tick=0.12, drive=3.0, lp=6200, hp=90, idle=1350, rev=3900, whine=[(8, 0.07), (12, 0.05)], jit=0.07, tjit=0.0004, vol=1.0, start_dur=1.0, crank=0.45),
}


def make(name, out):
    s = ENGINES[name]
    save(start_sound(s, s['idle']), out / f'{name}-start.mp3')
    save(loop(s, s['idle'], 1.1), out / f'{name}-idle.mp3')
    save(loop(s, s['rev'], 0.8), out / f'{name}-rev.mp3')


if __name__ == '__main__':
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for nm in (sys.argv[2:] or list(ENGINES)):
        make(nm, out)
        print('ok', nm)
