/**
 * mt_rand() idêntico ao do PHP 7.1+ (Mersenne Twister MT19937 + sorteio sem viés).
 * Com a mesma semente gera exatamente os mesmos números da versão PHP — assim os
 * dados fictícios (e a auditoria do DRE feita em cima deles) continuam iguais.
 */
const N = 624; const M = 397;

class MtRand {
  constructor(seed = Date.now()) { this.mt = new Uint32Array(N); this.srand(seed); }

  srand(seed) {
    const s = this.mt;
    s[0] = seed >>> 0;
    for (let i = 1; i < N; i++) {
      const p = s[i - 1] ^ (s[i - 1] >>> 30);
      s[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
    this.reload();
  }

  reload() {
    const s = this.mt;
    const tw = (m, u, v) => (m ^ ((((u & 0x80000000) | (v & 0x7fffffff)) >>> 1)) ^ ((-(v & 1)) & 0x9908b0df)) >>> 0;
    let p = 0;
    for (let i = N - M; i--; ++p) s[p] = tw(s[p + M], s[p], s[p + 1]);
    for (let i = M; --i; ++p) s[p] = tw(s[p + M - N], s[p], s[p + 1]);
    s[p] = tw(s[p + M - N], s[p], s[0]);
    this.idx = 0;
  }

  /** Próximo número de 32 bits. */
  u32() {
    if (this.idx >= N) this.reload();
    let y = this.mt[this.idx++];
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    return (y ^ (y >>> 18)) >>> 0;
  }

  /** mt_rand(min, max) */
  rand(min, max) {
    let umax = (max - min) >>> 0;
    let r = this.u32();
    if (umax === 0xFFFFFFFF) return r + min;
    umax = (umax + 1) >>> 0;
    if ((umax & (umax - 1)) === 0) return ((r & (umax - 1)) >>> 0) + min;
    const limit = 0xFFFFFFFF - (0xFFFFFFFF % umax) - 1;
    while (r > limit) r = this.u32();
    return (r % umax) + min;
  }
}

module.exports = MtRand;
