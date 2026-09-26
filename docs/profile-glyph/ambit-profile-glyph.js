// <ambit-profile-glyph> — Ambit profile glyph (option 6f)
// Ambient: 4-color radial flow (center → out), 10s loop.
// Tap: one full flow cycle in 900ms, cross-faded over the ambient flow.
// Usage: import './ambit-profile-glyph.js'; then <ambit-profile-glyph size="29"></ambit-profile-glyph>
// Attributes: size (px, default 29) · speed (ambient multiplier, default 1) · static (no ambient motion)
//             tap="rush" (default, 6f) | "flash" (6d rim flash) | "none"
// Honors prefers-reduced-motion (static fill, no tap motion).

export const AMBIT_PROFILE_GLYPH_TOKENS = {
  color: { periwinkle: '#A8AEFF', terracotta: '#E0A184', sage: '#7FC4B0', butter: '#E8D48A', rim: '#FFFFFF' },
  flow: {
    order: ['periwinkle', 'terracotta', 'sage', 'butter'],
    direction: 'out',
    durationMs: 10000,
    keySpline: '.45 0 .55 1',
    stops: [0, 0.33, 0.66, 1],
    center: [12, 14],
    radius: 12,
  },
  tap: {
    rush: { durationMs: 900, fade: { opacity: [0, 1, 1, 0], offsets: [0, 0.1, 0.85, 1] } },
    flash: {
      durationMs: 900,
      scale: { keyframes: [1, 1.055, 0.985, 1], offsets: [0, 0.3, 0.6, 1], origin: '50% 58%' },
      rim: { opacity: [0, 0.75, 0.25, 0], strokeWidth: [0, 1.4, 0.6, 0], offsets: [0, 0.3, 0.6, 1] },
    },
  },
  geometry: {
    viewBox: '0 0 24 24',
    head: { cx: 12, cy: 7.2, r: 5 },
    body: 'M2.8 20.2C2.8 15.9 7 13.5 12 13.5S21.2 15.9 21.2 20.2Q21.2 22.4 19 22.4H5Q2.8 22.4 2.8 20.2Z',
    defaultSize: 29,
    slot: 31,
    hitTarget: 44,
  },
};

const T = AMBIT_PROFILE_GLYPH_TOKENS;
let uid = 0;

const colors = () => T.flow.order.map(k => T.color[k]);
const cycle = (cols, shift) => Array.from({ length: cols.length + 1 }, (_, t) => cols[(((t + shift) % cols.length) + cols.length) % cols.length]).join(';');
const shapes = fill => {
  const { head, body } = T.geometry;
  return `<circle cx="${head.cx}" cy="${head.cy}" r="${head.r}" fill="${fill}"/><path d="${body}" fill="${fill}"/>`;
};
// Radial gradient whose stops cycle through the palette; stop i lags by i → colors travel outward.
const flowGradient = (id, durS, { still = false, once = false } = {}) => {
  const cols = colors();
  const dir = T.flow.direction === 'out' ? -1 : 1;
  const splines = Array(cols.length).fill(T.flow.keySpline).join(';');
  const timing = once ? 'fill="freeze"' : 'repeatCount="indefinite"';
  const stops = T.flow.stops.map((o, i) => `<stop offset="${o}" stop-color="${cols[0]}">${still ? '' :
    `<animate attributeName="stop-color" values="${cycle(cols, dir * i)}" dur="${durS}s" ${timing} calcMode="spline" keySplines="${splines}"/>`}</stop>`).join('');
  const [cx, cy] = T.flow.center;
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${T.flow.radius}">${stops}</radialGradient>`;
};

class AmbitProfileGlyph extends HTMLElement {
  static get observedAttributes() { return ['size', 'speed', 'static', 'tap']; }
  constructor() {
    super();
    this._id = `apg${++uid}`;
    this._taps = 0;
    this.attachShadow({ mode: 'open' });
    this._onTap = this._onTap.bind(this);
  }
  connectedCallback() { this._render(); this.addEventListener('click', this._onTap); }
  disconnectedCallback() { this.removeEventListener('click', this._onTap); }
  attributeChangedCallback() { if (this.isConnected) this._render(); }

  get _reduced() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
  get _size() { return parseFloat(this.getAttribute('size')) || T.geometry.defaultSize; }
  _svg(inner, cls = '') {
    return `<svg class="${cls}" width="${this._size}" height="${this._size}" viewBox="${T.geometry.viewBox}" aria-hidden="true">${inner}</svg>`;
  }

  _render() {
    const speed = parseFloat(this.getAttribute('speed')) || 1;
    const still = this.hasAttribute('static') || this._reduced;
    const durS = (T.flow.durationMs / 1000 / speed).toFixed(2);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:inline-flex; align-items:center; justify-content:center; width:${this._size}px; height:${this._size}px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .wrap { position:relative; display:flex; transform-origin:${T.tap.flash.scale.origin}; }
        svg { display:block; overflow:visible; }
        .fx { position:absolute; inset:0; pointer-events:none; }
      </style>
      <span class="wrap" part="glyph">
        ${this._svg(`<defs>${flowGradient(this._id, durS, { still })}</defs>${shapes(`url(#${this._id})`)}
          <g class="rim" fill="none" stroke="${T.color.rim}" style="stroke-opacity:0; stroke-width:0">${shapes('none')}</g>`)}
      </span>`;
    this._wrap = this.shadowRoot.querySelector('.wrap');
    this._rim = this.shadowRoot.querySelector('.rim');
  }

  _onTap() {
    if (this._reduced) return;
    const mode = this.getAttribute('tap') || 'rush';
    if (mode === 'rush') this._rush();
    else if (mode === 'flash') this._flash();
  }

  _rush() {
    const { durationMs, fade } = T.tap.rush;
    const id = `${this._id}-r${++this._taps}`;
    this._wrap.querySelectorAll('.fx').forEach(n => n.remove());
    const holder = document.createElement('span');
    holder.innerHTML = this._svg(`<defs>${flowGradient(id, durationMs / 1000, { once: true })}</defs><g>${shapes(`url(#${id})`)}</g>`, 'fx');
    const svg = holder.firstElementChild;
    this._wrap.appendChild(svg);
    const anim = svg.animate(fade.opacity.map((o, i) => ({ opacity: o, offset: fade.offsets[i] })), { duration: durationMs, fill: 'forwards' });
    anim.onfinish = () => svg.remove();
  }

  _flash() {
    const { durationMs, scale, rim } = T.tap.flash;
    const opts = { duration: durationMs, easing: 'ease' };
    this._wrap.animate(scale.keyframes.map((s, i) => ({ transform: `scale(${s})`, offset: scale.offsets[i] })), opts);
    this._rim.animate(rim.opacity.map((o, i) => ({ strokeOpacity: o, strokeWidth: rim.strokeWidth[i], offset: rim.offsets[i] })), opts);
  }
}

if (!customElements.get('ambit-profile-glyph')) customElements.define('ambit-profile-glyph', AmbitProfileGlyph);
export default AmbitProfileGlyph;
