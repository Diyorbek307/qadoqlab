/**
 * Isometric packaging illustrations drawn as SVG at build time.
 * They are illustrations, not photos of QADOQLAB products, and are captioned as such on the site.
 */
const C = Math.cos(Math.PI / 6);
const r = (n) => Math.round(n * 10) / 10;

const PAL = {
  top: ['#E3C399', '#D6B083'],
  left: ['#CFA676', '#C2965F'],
  right: ['#B68A58', '#A67A4A'],
  inner: '#97703F',
  innerLight: '#A98250',
  floor: '#8C6638',
  flapLit: '#D9B78A',
  flapInner: '#BF9563',
  edge: 'rgba(84,56,26,.32)',
  band: '#E8D3B2',
  wave: 'rgba(120,82,40,.75)',
  tape: '#E9D2AC',
  pod: { top: '#F1ECE2', left: '#E7E0D2', right: '#DDD4C4', edge: 'rgba(120,100,70,.18)' },
};

class Scene {
  constructor() {
    this.parts = [];
    this.pts = [];
  }
  P([x, y, z]) {
    const p = [(x - y) * C, (x + y) * 0.5 - z];
    this.pts.push(p);
    return p;
  }
  poly(pts3, fill, extra = '') {
    const d = pts3
      .map((p) => this.P(p))
      .map(([x, y]) => `${r(x)},${r(y)}`)
      .join(' ');
    const st = /stroke=/.test(extra) ? '' : `stroke="${PAL.edge}" `;
    this.parts.push(`<polygon points="${d}" fill="${fill}" ${st}stroke-width=".8" stroke-linejoin="round" ${extra}/>`);
  }
  line(a, b, stroke, w = 1, extra = '') {
    const [x1, y1] = this.P(a);
    const [x2, y2] = this.P(b);
    this.parts.push(
      `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`,
    );
  }
  raw(s) {
    this.parts.push(s);
  }
  // Wraps an object in a group so the hero animation can move it on its own.
  begin(cls) {
    this.parts.push(`<g class="${cls}">`);
  }
  end() {
    this.parts.push('</g>');
  }
  // Matrix that maps 2D face coordinates (u, v) to the screen.
  faceMatrix(origin, du, dv) {
    const o = this.P(origin);
    const a = [(du[0] - du[1]) * C, (du[0] + du[1]) * 0.5 - du[2]];
    const b = [(dv[0] - dv[1]) * C, (dv[0] + dv[1]) * 0.5 - dv[2]];
    return `matrix(${r(a[0] * 1000) / 1000} ${r(a[1] * 1000) / 1000} ${r(b[0] * 1000) / 1000} ${r(b[1] * 1000) / 1000} ${r(o[0])} ${r(o[1])})`;
  }
  shadow(x, y, z, w, d, spread = 26) {
    const pts = [
      [x - 4, y + 6, z],
      [x + w + spread, y + 6, z],
      [x + w + spread, y + d + spread, z],
      [x - 4, y + d + spread, z],
    ]
      .map((p) => this.P(p))
      .map(([a, b]) => `${r(a)},${r(b)}`)
      .join(' ');
    this.parts.push(`<polygon points="${pts}" fill="#3B2A16" opacity=".16" filter="url(#blur)"/>`);
  }
  podium(x, y, z, w, d, h) {
    this.shadow(x, y, z, w, d, 18);
    this.poly(
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      PAL.pod.left,
      `stroke="${PAL.pod.edge}"`,
    );
    this.poly(
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h],
      ],
      PAL.pod.right,
      `stroke="${PAL.pod.edge}"`,
    );
    this.poly(
      [
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      PAL.pod.top,
      `stroke="${PAL.pod.edge}"`,
    );
  }
  // Cut edge of corrugated board: two liners with the flute between them.
  flute(a, b, t, n) {
    // a, b: edge ends; t: thickness vector; n: number of waves
    this.poly([a, b, add(b, t), add(a, t)], PAL.band);
    const steps = n * 2;
    let d = '';
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const base = lerp(a, b, s);
      const k = i % 2 === 0 ? 0.18 : 0.82;
      const p = this.P(add(base, mul(t, k)));
      d += (i === 0 ? 'M' : 'L') + `${r(p[0])},${r(p[1])} `;
    }
    this.raw(`<path d="${d}" fill="none" stroke="${PAL.wave}" stroke-width=".9" stroke-linejoin="round"/>`);
  }
  closedBox(x, y, z, w, d, h, o = {}) {
    if (!o.noShadow) this.shadow(x, y, z, w, d);
    const L = [
      [x, y + d, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ];
    const R = [
      [x + w, y, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x + w, y, z + h],
    ];
    const T = [
      [x, y, z + h],
      [x + w, y, z + h],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ];
    this.raw('<g filter="url(#grain)">');
    this.poly(L, 'url(#gL)');
    this.poly(R, 'url(#gR)');
    this.poly(T, 'url(#gT)');
    this.raw('</g>');
    if (o.seam) {
      const sy = y + d / 2;
      if (o.tape && o.tapeAt !== undefined) {
        // Tape is pulled along the seam and pressed down the side.
        const tw = Math.min(26, d * 0.13);
        const tl = Math.min(70, h * 0.36);
        const top = z + h;
        const along = timeline(o.tapeAt, 0.42, 8, easeOut);
        const down = timeline(o.tapeAt + 0.42, 0.24, 6, easeOut);
        const strip = (k) =>
          this.points([
            [x, sy - tw, top],
            [x + w * k, sy - tw, top],
            [x + w * k, sy + tw, top],
            [x, sy + tw, top],
          ]);
        const side = (k) =>
          this.points([
            [x + w, sy - tw, top],
            [x + w, sy + tw, top],
            [x + w, sy + tw, top - tl * k],
            [x + w, sy - tw, top - tl * k],
          ]);
        this.raw(
          `<polygon points="${strip(1)}" fill="${PAL.tape}" opacity=".92">${smil('points', along.progress.map(strip), along.times, along.total)}</polygon>`,
        );
        this.raw(
          `<polygon points="${side(1)}" fill="#D2B486" opacity=".95">${smil('points', down.progress.map(side), down.times, down.total)}</polygon>`,
        );
      } else if (o.tape) {
        const tw = Math.min(26, d * 0.13);
        this.poly(
          [
            [x, sy - tw, z + h],
            [x + w, sy - tw, z + h],
            [x + w, sy + tw, z + h],
            [x, sy + tw, z + h],
          ],
          PAL.tape,
          'opacity=".92"',
        );
        const tl = Math.min(70, h * 0.36);
        this.poly(
          [
            [x + w, sy - tw, z + h],
            [x + w, sy + tw, z + h],
            [x + w, sy + tw, z + h - tl],
            [x + w, sy - tw, z + h - tl],
          ],
          '#D2B486',
          'opacity=".95"',
        );
      }
      this.line([x + 2, sy, z + h], [x + w - 2, sy, z + h], 'rgba(92,62,30,.45)', 1);
    }
    if (o.lid) {
      // telescope lid line
      const lz = z + h - o.lid;
      this.line([x, y + d, lz], [x + w, y + d, lz], 'rgba(84,56,26,.45)', 1.1);
      this.line([x + w, y, lz], [x + w, y + d, lz], 'rgba(60,40,18,.45)', 1.1);
    }
    if (o.mailerLip) {
      const lz = z + h - o.mailerLip;
      this.line([x + 10, y + d, lz], [x + w - 10, y + d, lz], 'rgba(84,56,26,.5)', 1.1);
      this.line([x + 10, y + d, lz], [x + 10, y + d, z + h], 'rgba(84,56,26,.35)', 1);
      this.line([x + w - 10, y + d, lz], [x + w - 10, y + d, z + h], 'rgba(84,56,26,.35)', 1);
    }
    if (o.tear) {
      const m = this.faceMatrix([x, y + d, z], [1, 0, 0], [0, 0, 1]);
      const v = h * 0.42;
      this.raw(
        `<g transform="${m}"><rect x="0" y="${r(v)}" width="${w}" height="9" fill="#E7CFA6" opacity=".85"/><line x1="0" y1="${r(v)}" x2="${w}" y2="${r(v)}" stroke="rgba(84,56,26,.45)" stroke-width="1" stroke-dasharray="5 4"/><line x1="0" y1="${r(v + 9)}" x2="${w}" y2="${r(v + 9)}" stroke="rgba(84,56,26,.45)" stroke-width="1" stroke-dasharray="5 4"/><path d="M${w - 26},${r(v)} l10,4.5 l-10,4.5z" fill="${'#A7653E'}" opacity=".8"/></g>`,
      );
    }
    if (o.handle) {
      const m = this.faceMatrix([x + w, y + d, z], [0, -1, 0], [0, 0, 1]);
      const cx = d / 2;
      const cy = h * 0.7;
      this.raw(
        `<g transform="${m}"><rect x="${r(cx - 34)}" y="${r(cy - 10)}" width="68" height="20" rx="10" fill="#4B331A"/><rect x="${r(cx - 34)}" y="${r(cy - 10)}" width="68" height="7" rx="3.5" fill="#2E1F0F" opacity=".7"/></g>`,
      );
    }
    if (o.label) {
      const m = this.faceMatrix([x, y + d, z], [1, 0, 0], [0, 0, 1]);
      const lw = w * 0.36;
      const lh = h * 0.3;
      const lx = w * 0.12;
      const ly = h * 0.42;
      this.raw(
        `<g transform="${m}"><rect x="${r(lx)}" y="${r(ly)}" width="${r(lw)}" height="${r(lh)}" fill="#F4EDE0"/><g stroke="#B9A88D" stroke-width="2.2" stroke-linecap="round"><line x1="${r(lx + 12)}" y1="${r(ly + lh * 0.72)}" x2="${r(lx + lw - 14)}" y2="${r(ly + lh * 0.72)}"/><line x1="${r(lx + 12)}" y1="${r(ly + lh * 0.48)}" x2="${r(lx + lw * 0.62)}" y2="${r(ly + lh * 0.48)}"/><line x1="${r(lx + 12)}" y1="${r(ly + lh * 0.24)}" x2="${r(lx + lw * 0.78)}" y2="${r(ly + lh * 0.24)}"/></g></g>`,
      );
    }
    if (o.mark) {
      const m = this.faceMatrix([x, y + d, z], [1, 0, 0], [0, 0, 1]);
      const s = Math.min(w, h) * 0.34;
      const cx = w * 0.5;
      const cy = h * 0.52;
      this.raw(
        `<g transform="${m}"><g transform="translate(${r(cx - s / 2)} ${r(cy + s / 2)}) scale(${r((s / 32) * 100) / 100} ${-r((s / 32) * 100) / 100})" fill="none" stroke="#123C2B" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" opacity=".88">${MARK_PATHS}</g></g>`,
      );
    }
  }
  openBox(x, y, z, w, d, h, o = {}) {
    const t = o.t || 6;
    const L = o.flap || d / 2;
    const bA = ((o.back || 18) * Math.PI) / 180;
    const fA = ((o.front || 62) * Math.PI) / 180;
    this.shadow(x, y, z, w, d);
    // back flaps
    const fb = (h0, h1, u, nrm, nw) => {
      const p2 = add(h1, mul(u, L));
      const p1 = add(h0, mul(u, L));
      this.poly([h0, h1, p2, p1], nrm);
      this.flute(p1, p2, mul(u, t), nw);
    };
    this.raw('<g filter="url(#grain)">');
    fb([x, y, z + h], [x, y + d, z + h], [-Math.sin(bA), 0, Math.cos(bA)], PAL.flapInner, Math.round(d / 9));
    fb([x, y, z + h], [x + w, y, z + h], [0, -Math.sin(bA), Math.cos(bA)], PAL.flapLit, Math.round(w / 9));
    // inside of the box
    this.poly(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + d, z],
        [x, y + d, z],
      ],
      PAL.floor,
    );
    this.poly(
      [
        [x + t, y, z],
        [x + t, y + d, z],
        [x + t, y + d, z + h],
        [x + t, y, z + h],
      ],
      PAL.innerLight,
    );
    this.poly(
      [
        [x, y + t, z],
        [x + w, y + t, z],
        [x + w, y + t, z + h],
        [x, y + t, z + h],
      ],
      PAL.inner,
    );
    this.poly(
      [
        [x + t, y + t, z + 1],
        [x + w, y + t, z + 1],
        [x + w, y + d, z + 1],
        [x + t, y + d, z + 1],
      ],
      'url(#gFloor)',
    );
    if (o.content) o.content(this);
    // back wall edges
    this.flute([x, y, z + h], [x, y + d, z + h], [t, 0, 0], Math.round(d / 9));
    this.flute([x, y, z + h], [x + w, y, z + h], [0, t, 0], Math.round(w / 9));
    // front walls
    this.poly(
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      'url(#gL)',
    );
    this.poly(
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h],
      ],
      'url(#gR)',
    );
    this.flute([x, y + d - t, z + h], [x + w, y + d - t, z + h], [0, t, 0], Math.round(w / 9));
    this.flute([x + w - t, y, z + h], [x + w - t, y + d, z + h], [t, 0, 0], Math.round(d / 9));
    if (!o.noFrontFlaps) {
      fb([x, y + d, z + h], [x + w, y + d, z + h], [0, Math.sin(fA), Math.cos(fA)], PAL.flapLit, Math.round(w / 9));
      fb([x + w, y, z + h], [x + w, y + d, z + h], [Math.sin(fA), 0, Math.cos(fA)], '#C9A06F', Math.round(d / 9));
    }
    this.raw('</g>');
  }
  points(list) {
    return list
      .map((p) => this.P(p))
      .map(([px, py]) => `${r(px)},${r(py)}`)
      .join(' ');
  }

  // A flap that swings about the hinge a→b from angle `from` to `to` (degrees); dir(θ) is the
  // unit vector from the hinge to the free edge. A back flap is drawn twice: in front of the box
  // while it lies over the opening, behind it once it has passed vertical (layer 'front'/'back').
  swingFlap({ a, b, dir, from, to, length, thick, waves, colors, hold, dur, layer = null }) {
    const shape = (deg) => {
      const u = dir((deg * Math.PI) / 180);
      const p1 = add(a, mul(u, length));
      const p2 = add(b, mul(u, length));
      const t = mul(u, thick);
      let wave = '';
      for (let i = 0; i <= waves * 2; i++) {
        const q = this.P(add(lerp(p1, p2, i / (waves * 2)), mul(t, i % 2 ? 0.82 : 0.18)));
        wave += `${i ? 'L' : 'M'}${r(q[0])},${r(q[1])} `;
      }
      return {
        flap: this.points([a, b, p2, p1]),
        band: this.points([p1, p2, add(p2, t), add(p1, t)]),
        wave: wave.trim(),
      };
    };
    const { total, times, progress } = timeline(hold, dur, 16, easeInOut);
    const angles = progress.map((k) => from + (to - from) * k);
    const shapes = angles.map(shape);
    const last = shapes[shapes.length - 1];
    const stroke = `stroke="${PAL.edge}" stroke-width=".8" stroke-linejoin="round"`;
    const body =
      `<polygon points="${last.flap}" fill="${colors[1]}" ${stroke}>` +
      smil(
        'points',
        shapes.map((x) => x.flap),
        times,
        total,
      ) +
      smil(
        'fill',
        progress.map((k) => mix(colors[0], colors[1], k)),
        times,
        total,
      ) +
      '</polygon>' +
      `<polygon points="${last.band}" fill="${PAL.band}" ${stroke}>${smil(
        'points',
        shapes.map((x) => x.band),
        times,
        total,
      )}</polygon>` +
      `<path d="${last.wave}" fill="none" stroke="${PAL.wave}" stroke-width=".9" stroke-linejoin="round">${smil(
        'd',
        shapes.map((x) => x.wave),
        times,
        total,
      )}</path>`;
    if (!layer) return this.raw(body);
    const crossing = times[angles.findIndex((deg) => deg >= 0)];
    const states = layer === 'front' ? ['visible', 'hidden'] : ['hidden', 'visible'];
    return this.raw(
      `<g visibility="${states[1]}">${smil('visibility', states, [0, crossing], total, 'discrete')}${body}</g>`,
    );
  }

  // Open box for the hero: it arrives closed and taped, the tape comes off and the flaps open,
  // the long (major) pair first. Final geometry matches openBox().
  openBoxAnimated(x, y, z, w, d, h, { back = 14, front = 64, hold = 1.35, dur = 0.8, minorDelay = 0.35 } = {}) {
    const t = 6;
    const top = z + h;
    const length = d / 2;
    const major = { hold, dur, waves: Math.round(w / 9) };
    const minor = { hold: hold + minorDelay, dur, waves: Math.round(d / 9) };
    const flaps = {
      backMinor: {
        ...minor,
        a: [x, y, top],
        b: [x, y + d, top],
        dir: (th) => [-Math.sin(th), 0, Math.cos(th)],
        to: back,
        colors: [PAL.top[1], PAL.flapInner],
      },
      backMajor: {
        ...major,
        a: [x, y, top],
        b: [x + w, y, top],
        dir: (th) => [0, -Math.sin(th), Math.cos(th)],
        to: back,
        colors: [PAL.top[0], PAL.flapLit],
      },
      frontMinor: {
        ...minor,
        a: [x + w, y, top],
        b: [x + w, y + d, top],
        dir: (th) => [Math.sin(th), 0, Math.cos(th)],
        to: front,
        colors: [PAL.top[1], '#C9A06F'],
      },
      frontMajor: {
        ...major,
        a: [x, y + d, top],
        b: [x + w, y + d, top],
        dir: (th) => [0, Math.sin(th), Math.cos(th)],
        to: front,
        colors: [PAL.top[0], PAL.flapLit],
      },
    };
    const swing = (flap, layer) => this.swingFlap({ ...flap, from: -90, length, thick: t, layer });
    const quad = (pts, fill) => this.poly(pts, fill);

    this.shadow(x, y, z, w, d);
    swing(flaps.backMinor, 'back');
    swing(flaps.backMajor, 'back');
    quad(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + d, z],
        [x, y + d, z],
      ],
      PAL.floor,
    );
    quad(
      [
        [x + t, y, z],
        [x + t, y + d, z],
        [x + t, y + d, top],
        [x + t, y, top],
      ],
      PAL.innerLight,
    );
    quad(
      [
        [x, y + t, z],
        [x + w, y + t, z],
        [x + w, y + t, top],
        [x, y + t, top],
      ],
      PAL.inner,
    );
    quad(
      [
        [x + t, y + t, z + 1],
        [x + w, y + t, z + 1],
        [x + w, y + d, z + 1],
        [x + t, y + d, z + 1],
      ],
      'url(#gFloor)',
    );
    this.flute([x, y, top], [x, y + d, top], [t, 0, 0], Math.round(d / 9));
    this.flute([x, y, top], [x + w, y, top], [0, t, 0], Math.round(w / 9));
    quad(
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, top],
        [x, y + d, top],
      ],
      'url(#gL)',
    );
    quad(
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, top],
        [x + w, y, top],
      ],
      'url(#gR)',
    );
    this.flute([x, y + d - t, top], [x + w, y + d - t, top], [0, t, 0], Math.round(w / 9));
    this.flute([x + w - t, y, top], [x + w - t, y + d, top], [t, 0, 0], Math.round(d / 9));
    // Closing order of a real box: minors under majors.
    swing(flaps.backMinor, 'front');
    swing(flaps.frontMinor);
    swing(flaps.backMajor, 'front');
    swing(flaps.frontMajor);

    // Tape over the seam: present on arrival, peeled off just before the flaps move.
    const tw = Math.min(26, d * 0.13);
    const sy = y + d / 2;
    // It rolls up from the far end: the start edge slides along the seam until nothing is left.
    const peel = timeline(hold - 0.45, 0.4, 8, easeInOut);
    const tape = (k) => {
      const from = x - 2 + (w + 4) * k;
      return this.points([
        [from, sy - tw, top],
        [x + w + 2, sy - tw, top],
        [x + w + 2, sy + tw, top],
        [from, sy + tw, top],
      ]);
    };
    this.raw(
      `<polygon points="${tape(1)}" fill="#EAD3A8" stroke="rgba(120,84,40,.35)" stroke-width=".8" opacity="0">` +
        smil('points', peel.progress.map(tape), peel.times, peel.total) +
        smil('opacity', [1, 1, 0], [0, 0.97, 1], peel.total) +
        '</polygon>',
    );
  }

  // Mailer box with the lid folded back.
  mailerOpen(x, y, z, w, d, h) {
    const t = 7;
    this.shadow(x, y, z, w, d);
    this.raw('<g filter="url(#grain)">');
    // lid, folded back
    const a = (16 * Math.PI) / 180;
    const u = [0, -Math.sin(a), Math.cos(a)];
    const h0 = [x, y, z + h];
    const h1 = [x + w, y, z + h];
    const p1 = add(h0, mul(u, d));
    const p2 = add(h1, mul(u, d));
    this.poly([h0, h1, p2, p1], PAL.flapLit);
    // front lip of the lid
    const lip = mul([0, Math.cos(a), Math.sin(a)], h * 0.55);
    this.poly([p1, p2, add(p2, lip), add(p1, lip)], '#C99C69');
    this.flute(add(p1, lip), add(p2, lip), mul(u, -t * 0.9), Math.round(w / 9));
    // side ear of the lid
    this.poly([h1, p2, add(p2, [0, h * 0.25, -h * 0.05]), add(h1, [0, h * 0.5, 0])], '#B78B59');
    // tray
    this.poly(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + d, z],
        [x, y + d, z],
      ],
      PAL.floor,
    );
    this.poly(
      [
        [x + t, y, z],
        [x + t, y + d, z],
        [x + t, y + d, z + h],
        [x + t, y, z + h],
      ],
      PAL.innerLight,
    );
    this.poly(
      [
        [x, y + t, z],
        [x + w, y + t, z],
        [x + w, y + t, z + h],
        [x, y + t, z + h],
      ],
      PAL.inner,
    );
    this.poly(
      [
        [x + t, y + t, z + 1],
        [x + w, y + t, z + 1],
        [x + w, y + d, z + 1],
        [x + t, y + d, z + 1],
      ],
      'url(#gFloor)',
    );
    this.flute([x, y, z + h], [x, y + d, z + h], [t, 0, 0], Math.round(d / 9));
    this.poly(
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      'url(#gL)',
    );
    this.poly(
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h],
      ],
      'url(#gR)',
    );
    this.flute([x, y + d - t, z + h], [x + w, y + d - t, z + h], [0, t, 0], Math.round(w / 9));
    this.flute([x + w - t, y, z + h], [x + w - t, y + d, z + h], [t, 0, 0], Math.round(d / 9));
    this.raw('</g>');
  }
  // Flat box blank (u runs along x, v along y).
  dieline(x, y, z, A, B, H) {
    const F = B / 2;
    const g = 22;
    const gap = 3;
    const xs = [g, g + A, g + A + B, g + 2 * A + B, g + 2 * A + 2 * B];
    const W = xs[4];
    const T = H + 2 * F;
    const m = this.faceMatrix([x, y, z], [1, 0, 0], [0, 1, 0]);
    this.shadow(x, y, z, W, T, 8);
    // register the corners so the viewBox includes them
    [
      [x, y, z],
      [x + W, y, z],
      [x + W, y + T, z],
      [x, y + T, z],
    ].forEach((p) => this.P(p));
    let fill = `M0,${F + 8}L${g},${F}L${g},${F + H}L0,${F + H - 8}Z M${g},${F}H${W}V${F + H}H${g}Z `;
    let cut = `M${g},${F}L0,${F + 8}V${F + H - 8}L${g},${F + H} M${W},${F}V${F + H} `;
    for (let i = 0; i < 4; i++) {
      const a = xs[i] + (i ? gap : 0);
      const b = xs[i + 1] - (i < 3 ? gap : 0);
      fill += `M${a},0H${b}V${F}H${a}Z M${a},${F + H}H${b}V${T}H${a}Z `;
      cut += `M${a},${F}V0H${b}V${F} M${a},${F + H}V${T}H${b}V${F + H} `;
    }
    let folds = '';
    for (let i = 0; i < 5; i++) folds += `M${xs[i]},${F}V${F + H} `;
    folds += `M${g},${F}H${W} M${g},${F + H}H${W}`;
    this.raw(
      `<g transform="${m}"><g filter="url(#grain)"><path d="${fill}" fill="#DDBB8E"/></g><path d="${cut}" fill="none" stroke="rgba(84,56,26,.6)" stroke-width="1.4" stroke-linejoin="round"/><path d="${folds}" fill="none" stroke="#A7653E" stroke-width="1.6" stroke-dasharray="7 5"/></g>`,
    );
  }
  textile(x, y, z, w, d, layers) {
    let zz = z;
    for (const [col, side, hh] of layers) {
      this.poly(
        [
          [x, y + d, zz],
          [x + w, y + d, zz],
          [x + w, y + d, zz + hh],
          [x, y + d, zz + hh],
        ],
        side,
      );
      this.poly(
        [
          [x + w, y, zz],
          [x + w, y + d, zz],
          [x + w, y + d, zz + hh],
          [x + w, y, zz + hh],
        ],
        side,
        'opacity=".85"',
      );
      this.poly(
        [
          [x, y, zz + hh],
          [x + w, y, zz + hh],
          [x + w, y + d, zz + hh],
          [x, y + d, zz + hh],
        ],
        col,
      );
      zz += hh;
    }
  }
  // grain: false drops the paper texture filter — used for the animated hero, where a
  // turbulence filter would be re-rendered on every animation frame.
  svg({ pad = 30, aspect = null, title = '', grain = true } = {}) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [px, py] of this.pts) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    let W = maxX - minX,
      H = maxY - minY;
    if (aspect) {
      if (W / H > aspect) {
        const nh = W / aspect;
        minY -= (nh - H) / 2;
        H = nh;
      } else {
        const nw = H * aspect;
        minX -= (nw - W) / 2;
        W = nw;
      }
    }
    let body = this.parts.join('');
    let defs = DEFS;
    if (!grain) {
      body = body.replace(/ filter="url\(#grain\)"/g, '');
      defs = defs.replace(/<filter id="grain"[\s\S]*?<\/filter>/, '');
    }
    const heading = title ? `<title>${title}</title>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(minX)} ${r(minY)} ${r(W)} ${r(H)}" width="${Math.round(W)}" height="${Math.round(H)}" role="img">${heading}${defs}${body}</svg>`;
  }
}

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOut = (k) => 1 - (1 - k) ** 3;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, k) =>
  `#${rgb(a)
    .map((v, i) => Math.round(v + (rgb(b)[i] - v) * Math.min(Math.max(k, 0), 1)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;

// SMIL animation started by the hero's #hxGo trigger. Static attributes always hold the final
// frame, so without JavaScript (or with reduced motion) the picture is simply complete.
function smil(attr, values, times, total, calcMode = 'linear') {
  const keyTimes = times.map((k) => Number(k.toFixed(4))).join(';');
  return `<animate attributeName="${attr}" values="${values.join(';')}" keyTimes="${keyTimes}" dur="${total.toFixed(2)}s" begin="hxGo.begin" fill="freeze" calcMode="${calcMode}"/>`;
}

// Timeline for a move that waits `hold` seconds and then runs for `dur`, sampled in `frames` steps.
function timeline(hold, dur, frames, ease) {
  const total = hold + dur;
  const times = [0];
  const progress = [0];
  for (let i = 0; i <= frames; i++) {
    times.push((hold + (dur * i) / frames) / total);
    progress.push(ease(i / frames));
  }
  return { total, times, progress };
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];

// Temporary QADOQLAB mark: a square "Q" with a flap fold line and a cut-line tail (32×32 grid).
const MARK_PATHS = '<path d="M5 5h22v22H5z"/><path d="M5 12h22" stroke-dasharray="3.2 3"/><path d="M19 19l9 9"/>';

const DEFS = `<defs>
<linearGradient id="gT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${PAL.top[0]}"/><stop offset="1" stop-color="${PAL.top[1]}"/></linearGradient>
<linearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAL.left[0]}"/><stop offset="1" stop-color="${PAL.left[1]}"/></linearGradient>
<linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAL.right[0]}"/><stop offset="1" stop-color="${PAL.right[1]}"/></linearGradient>
<linearGradient id="gFloor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5A3F20" stop-opacity=".55"/><stop offset=".6" stop-color="#5A3F20" stop-opacity="0"/></linearGradient>
<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .32  0 0 0 0 .21  0 0 0 0 .1  0 0 0 .16 0" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in" result="m"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="m"/></feMerge></filter>
</defs>`;

const TEX = [
  ['#E9E3D6', '#D9D1C0', 24],
  ['#2F5A47', '#244A3A', 22],
  ['#E9E3D6', '#D9D1C0', 22],
  ['#D8C9AE', '#C6B597', 22],
];

const scenes = {
  hero() {
    const s = new Scene();
    // Trigger for every SMIL animation in the hero; started from app.js unless motion is reduced.
    s.raw('<animate id="hxGo" attributeName="opacity" values="1;1" dur="0.1s" begin="indefinite"/>');
    s.begin('hx hx-pod hx-1');
    s.podium(0, 0, 0, 520, 360, 70);
    s.end();
    s.begin('hx hx-box hx-2');
    s.closedBox(40, 50, 70, 280, 210, 200, { seam: true, tape: true, tapeAt: 1.1 });
    s.end();
    s.begin('hx hx-box hx-4');
    s.closedBox(90, 90, 270, 170, 130, 110, { seam: true, tape: true, tapeAt: 1.45 });
    s.end();
    s.begin('hx hx-box hx-3');
    s.closedBox(360, 80, 70, 130, 110, 90, { seam: true });
    s.end();
    s.begin('hx hx-pod hx-2');
    s.podium(320, 350, 0, 340, 280, 34);
    s.end();
    s.begin('hx hx-box hx-5');
    s.openBoxAnimated(365, 395, 34, 230, 175, 160, { back: 14, front: 64 });
    s.end();
    s.begin('hx hx-box hx-6');
    s.closedBox(-40, 410, 0, 200, 140, 56, { mailerLip: 16 });
    s.end();
    return s.svg({ pad: 24, aspect: 1.08, grain: false });
  },
  transport() {
    const s = new Scene();
    s.podium(0, 0, 0, 380, 300, 40);
    s.closedBox(55, 50, 40, 260, 190, 190, { seam: true, tape: true });
    return s.svg({ aspect: 4 / 3 });
  },
  open() {
    const s = new Scene();
    s.podium(0, 0, 0, 380, 300, 40);
    s.openBox(70, 70, 40, 230, 170, 160);
    return s.svg({ aspect: 4 / 3 });
  },
  mailer() {
    const s = new Scene();
    s.podium(0, 0, 0, 380, 320, 40);
    s.mailerOpen(70, 110, 40, 240, 170, 70);
    return s.svg({ aspect: 4 / 3 });
  },
  mailerClosed() {
    const s = new Scene();
    s.podium(0, 0, 0, 380, 300, 40);
    s.closedBox(70, 70, 40, 240, 170, 80, { mailerLip: 20, tear: true });
    s.closedBox(110, 100, 120, 160, 110, 54, { mailerLip: 15, noShadow: false });
    return s.svg({ aspect: 4 / 3 });
  },
  flat() {
    const s = new Scene();
    s.podium(0, 0, 0, 400, 330, 40);
    s.closedBox(70, 30, 40, 270, 30, 210, { lid: 0 });
    s.openBox(60, 110, 40, 270, 190, 64, {
      noFrontFlaps: true,
      back: 0,
      flap: 0.001,
      content: (sc) => sc.textile(84, 132, 41, 200, 140, TEX),
    });
    return s.svg({ aspect: 4 / 3 });
  },
  archive() {
    const s = new Scene();
    s.podium(0, 0, 0, 380, 300, 40);
    s.closedBox(70, 60, 40, 250, 170, 160, { lid: 34, handle: true, label: true });
    return s.svg({ aspect: 4 / 3 });
  },
  dieline() {
    const s = new Scene();
    s.podium(-20, -20, 0, 560, 300, 24);
    s.dieline(10, 30, 24, 120, 80, 110);
    s.closedBox(380, 30, 24, 120, 80, 110, { seam: true });
    return s.svg({ aspect: 4 / 3 });
  },
  printed() {
    const s = new Scene();
    s.podium(0, 0, 0, 380, 300, 40);
    s.closedBox(60, 60, 40, 250, 180, 190, { seam: true, tape: true, mark: true });
    return s.svg({ aspect: 4 / 3 });
  },
  about() {
    const s = new Scene();
    s.podium(0, 0, 0, 760, 300, 50);
    s.closedBox(30, 40, 50, 200, 160, 220, { seam: true, tape: true });
    s.closedBox(280, 60, 50, 170, 140, 130, { lid: 30, handle: true });
    s.closedBox(300, 80, 180, 120, 100, 80, { seam: true });
    s.openBox(540, 90, 50, 160, 130, 110, { back: 12, front: 66 });
    return s.svg({ aspect: 16 / 10 });
  },
};

module.exports = { scenes, MARK_PATHS };
