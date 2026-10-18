"""8-bit sound generator for NoWomp's power-up. Pure Python, no dependencies.

    python scripts/generate-sounds.py

Builds, per variant: charge.wav (matches the 1.15s charge-up in
components/celebration/PowerUpHero.tsx), burst.wav (the flash) and
sparkle.wav, plus a preview with all three on the real timeline. The app ships
variant C ("Level Up"), copied to assets/sounds/powerup-*.wav.

Output goes to scripts/sound-out/ (git-ignored).
"""
import math
import random
import struct
import wave
import os

SR = 22050
CHARGE_S = 1.15
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sound-out')


def note(n):
    """MIDI note number -> Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def square(freq, t, duty=0.5):
    return 1.0 if (freq * t) % 1.0 < duty else -1.0


def triangle(freq, t):
    p = (freq * t) % 1.0
    return 4 * p - 1 if p < 0.5 else 3 - 4 * p


class Noise:
    """NES-style noise: a held random value, re-rolled at `rate` Hz."""

    def __init__(self, seed=1):
        self.r = random.Random(seed)
        self.v = 0.0
        self.next_t = 0.0

    def at(self, t, rate):
        if t >= self.next_t:
            self.v = self.r.choice((-1.0, 1.0))
            self.next_t = t + 1.0 / rate
        return self.v


def buf(seconds):
    return [0.0] * int(SR * seconds)


def mix(dst, src, at_s=0.0, gain=1.0):
    o = int(at_s * SR)
    for i, v in enumerate(src):
        if 0 <= o + i < len(dst):
            dst[o + i] += v * gain
    return dst


def env(i, n, a=0.005, r=0.05):
    """Attack/release envelope in seconds, for a segment of n samples."""
    t = i / SR
    total = n / SR
    up = min(1.0, t / a) if a > 0 else 1.0
    down = min(1.0, (total - t) / r) if r > 0 else 1.0
    return max(0.0, min(up, down))


def tone(freq, seconds, wave_fn='square', duty=0.5, vol=0.5, a=0.004, r=0.04, slide_to=None, vib=0.0):
    n = int(SR * seconds)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        f = freq if slide_to is None else freq * (slide_to / freq) ** (i / n)
        if vib:
            f *= 1 + vib * math.sin(2 * math.pi * 7 * t)
        phase += f / SR
        p = phase % 1.0
        if wave_fn == 'square':
            s = 1.0 if p < duty else -1.0
        else:
            s = 4 * p - 1 if p < 0.5 else 3 - 4 * p
        out.append(s * vol * env(i, n, a, r))
    return out


def noise_burst(seconds, vol=0.6, rate_from=8000, rate_to=600, seed=3, decay=6.0):
    nz = Noise(seed)
    n = int(SR * seconds)
    out = []
    for i in range(n):
        t = i / SR
        rate = rate_from * (rate_to / rate_from) ** (i / n)
        out.append(nz.at(t, rate) * vol * math.exp(-decay * t))
    return out


def sparkle(seconds=0.9, seed=5):
    """Soft high triangle blips: pixel stars twinkling."""
    r = random.Random(seed)
    out = buf(seconds)
    t = 0.05
    for _ in range(7):
        n = r.choice([96, 100, 103, 108])  # high C/E/G
        mix(out, tone(note(n), 0.07, 'triangle', vol=0.16 * (1 - t / seconds) + 0.04, a=0.002, r=0.05), t)
        t += r.uniform(0.07, 0.14)
        if t > seconds - 0.1:
            break
    return out


# ------------------------------------------------------------------ variants

def charge_powerup():
    """A: rising C-major arpeggio that accelerates, with a growing pulse."""
    out = buf(CHARGE_S)
    scale = [48, 52, 55, 60, 64, 67, 72, 76, 79, 84]
    t = 0.0
    step = 0.11
    k = 0
    while t < CHARGE_S - 0.03:
        n = scale[min(k // 2, len(scale) - 1)] + (12 if k % 2 else 0)
        vol = 0.18 + 0.32 * (t / CHARGE_S)
        mix(out, tone(note(n), step * 0.9, duty=0.25, vol=vol, r=0.01), t)
        t += step
        step = max(0.035, step * 0.9)
        k += 1
    return out


def burst_powerup():
    out = buf(0.9)
    mix(out, noise_burst(0.5, vol=0.55, decay=7))
    mix(out, tone(note(36), 0.35, duty=0.5, vol=0.45, slide_to=note(24), r=0.2))
    for i, n in enumerate([72, 76, 79, 84]):  # bright fanfare C E G C
        mix(out, tone(note(n), 0.5 - i * 0.06, duty=0.25, vol=0.28, r=0.25), 0.02 + i * 0.045)
    return out


def charge_energy():
    """B: continuous sweep up with vibrato + growing static, like energy gathering."""
    n = int(SR * CHARGE_S)
    out = []
    nz = Noise(11)
    phase = 0.0
    for i in range(n):
        t = i / SR
        x = i / n
        f = 110 * (880 / 110) ** (x ** 1.4)
        f *= 1 + 0.03 * math.sin(2 * math.pi * (6 + 10 * x) * t)
        phase += f / SR
        sq = 1.0 if (phase % 1.0) < 0.5 - 0.35 * x else -1.0
        static = nz.at(t, 3000 + 9000 * x) * 0.22 * x
        out.append(sq * (0.12 + 0.3 * x) + static)
    # tiny fade-in so it never clicks
    for i in range(int(SR * 0.02)):
        out[i] *= i / (SR * 0.02)
    return out


def burst_energy():
    out = buf(1.0)
    mix(out, noise_burst(0.8, vol=0.7, rate_from=12000, rate_to=300, decay=4.5))
    mix(out, tone(note(43), 0.6, duty=0.5, vol=0.5, slide_to=note(19), r=0.3))
    mix(out, tone(note(79), 0.45, duty=0.125, vol=0.2, r=0.3, vib=0.01), 0.03)
    mix(out, tone(note(86), 0.45, duty=0.125, vol=0.16, r=0.3, vib=0.01), 0.03)
    return out


def charge_levelup():
    """C: ascending scale ticks that speed up."""
    out = buf(CHARGE_S)
    scale = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91]
    t = 0.0
    step = 0.1
    k = 0
    while t < CHARGE_S - 0.02 and k < len(scale):
        vol = 0.15 + 0.3 * (t / CHARGE_S)
        mix(out, tone(note(scale[k]), min(step * 0.6, 0.05), duty=0.5, vol=vol, r=0.01), t)
        t += step
        step = max(0.04, step * 0.86)
        k += 1
    return out


def burst_levelup():
    out = buf(1.0)
    mix(out, noise_burst(0.25, vol=0.45, decay=12))
    mix(out, tone(note(79), 0.12, duty=0.25, vol=0.32, r=0.02), 0.0)      # G5
    mix(out, tone(note(84), 0.75, duty=0.25, vol=0.34, r=0.4, vib=0.008), 0.12)  # C6, held
    mix(out, tone(note(76), 0.75, duty=0.5, vol=0.16, r=0.4), 0.12)       # E5 harmony
    mix(out, tone(note(48), 0.5, duty=0.5, vol=0.25, r=0.3), 0.12)        # C3 bass
    return out


VARIANTS = {
    'A-powerup': (charge_powerup, burst_powerup),
    'B-energy': (charge_energy, burst_energy),
    'C-levelup': (charge_levelup, burst_levelup),
}


def write(path, samples, peak=0.85):
    m = max(1e-9, max(abs(s) for s in samples))
    k = peak / m
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s * k)) * 32767)) for s in samples))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, (charge_fn, burst_fn) in VARIANTS.items():
        charge, burst, tail = charge_fn(), burst_fn(), sparkle()
        d = os.path.join(OUT, name)
        os.makedirs(d, exist_ok=True)
        write(os.path.join(d, 'charge.wav'), charge, peak=0.7)
        write(os.path.join(d, 'burst.wav'), burst)
        write(os.path.join(d, 'sparkle.wav'), tail, peak=0.45)
        # Preview on the real timeline: charge, then burst at 1.15s, then sparkle.
        full = buf(CHARGE_S + 1.6)
        mix(full, charge, 0.0, 1.9)
        mix(full, burst, CHARGE_S, 1.0)
        mix(full, tail, CHARGE_S + 0.35, 0.55)
        write(os.path.join(OUT, f'preview-{name}.wav'), full)
        print('wrote', name)
