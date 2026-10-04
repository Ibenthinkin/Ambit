// <ambit-loader> — Ambit "Reach" loader: the mark's dot leaves center, orbits the ring, returns home.
// Usage: import './ambit-loader.js';
//   <ambit-loader label="finding something interesting…"></ambit-loader>
// Attributes: size (px, default 18) · label (optional visible text; also the a11y name) · color (default var(--ambit-accent, #4C5FE0))
//   · duration (ms, default 2400) · paused (boolean) · calm (boolean: under prefers-reduced-motion, keep the dot still and only pulse the ring)
// Also exports AMBIT_LOADER_TOKENS and loaderSVG(opts) for static/SSR use.

export const AMBIT_LOADER_TOKENS = {
  name: 'reach',
  viewBox: '0 0 26 26',
  ring: { r: 11.5, strokeWidth: { large: 1.7, small: 2 }, opacity: { min: 0.28, max: 0.75 } },
  dot: { r: 3.6, reachScale: 0.55 },
  smallBelowPx: 22,
  sizes: { inline: 18, block: 26, hero: 64 },
  color: 'var(--ambit-accent, #4C5FE0)',
  label: { font: "'Sora', sans-serif", size: 14, color: 'rgba(239,235,224,0.4)', gap: 10 },
  motion: {
    durationMs: 2400,
    easing: 'cubic-bezier(.65,0,.35,1)',
    // keyframe stops as fractions of the cycle
    reachOut: [0, 0.22],    // dot travels center → ring edge
    orbit: [0.22, 0.78],    // group rotates 0 → 360°
    reachIn: [0.78, 1],     // dot returns to center
    ringPulse: 'ease-in-out',
  },
  reducedMotion: 'opt-in via [calm]: dot stays centered; ring pulses opacity only',
};

const T = AMBIT_LOADER_TOKENS;

export function loaderSVG({ size = T.sizes.inline, color = 'currentColor' } = {}) {
  const sw = size < T.smallBelowPx ? T.ring.strokeWidth.small : T.ring.strokeWidth.large;
  return `<svg width="${size}" height="${size}" viewBox="${T.viewBox}" aria-hidden="true"><circle cx="13" cy="13" r="${T.ring.r}" fill="none" stroke="${color}" stroke-width="${sw}" opacity="${T.ring.opacity.min}"/><circle cx="13" cy="13" r="${T.dot.r}" fill="${color}"/></svg>`;
}

const pct = n => (n * 100).toFixed(0) + '%';
const m = T.motion;
const CSS = `
:host { display: inline-flex; align-items: center; gap: ${T.label.gap}px; color: ${T.color}; vertical-align: middle; }
:host([hidden]) { display: none; }
.box { position: relative; flex: none; }
.mark { position: absolute; left: 0; top: 0; width: 26px; height: 26px; transform-origin: 0 0; }
svg { position: absolute; inset: 0; overflow: visible; }
.ring { animation: ring var(--d) ease-in-out infinite; }
.spin { position: absolute; inset: 0; animation: spin var(--d) ${m.easing} infinite; }
.dot { position: absolute; left: ${13 - T.dot.r}px; top: ${13 - T.dot.r}px; width: ${T.dot.r * 2}px; height: ${T.dot.r * 2}px; border-radius: 50%; background: currentColor; animation: reach var(--d) ${m.easing} infinite; }
.label { font: 400 ${T.label.size}px/1.3 ${T.label.font}; color: ${T.label.color}; }
.label:empty { display: none; }
:host([paused]) * { animation-play-state: paused; }
@keyframes ring { 0%, 100% { opacity: ${T.ring.opacity.min}; } 50% { opacity: ${T.ring.opacity.max}; } }
@keyframes spin { 0%, ${pct(m.orbit[0])} { transform: rotate(0deg); } ${pct(m.orbit[1])}, 100% { transform: rotate(360deg); } }
@keyframes reach { 0%, 100% { transform: translateX(0) scale(1); } ${pct(m.reachOut[1])}, ${pct(m.reachIn[0])} { transform: translateX(${T.ring.r}px) scale(${T.dot.reachScale}); } }
@media (prefers-reduced-motion: reduce) { :host([calm]) .spin, :host([calm]) .dot { animation: none; } }
`;

class AmbitLoader extends HTMLElement {
  static get observedAttributes() { return ['size', 'label', 'color', 'duration']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>${CSS}</style>
<span class="box" aria-hidden="true"><span class="mark">
  <svg width="26" height="26" viewBox="${T.viewBox}"><circle class="ring" cx="13" cy="13" r="${T.ring.r}" fill="none" stroke="currentColor"></circle></svg>
  <span class="spin"><span class="dot"></span></span>
</span></span><span class="label" part="label"></span>`;
  }
  connectedCallback() {
    this.setAttribute('role', 'status');
    this.setAttribute('aria-live', 'polite');
    this._render();
  }
  attributeChangedCallback() { this._render(); }
  _render() {
    const r = this.shadowRoot; if (!r) return;
    const size = parseFloat(this.getAttribute('size')) || T.sizes.inline;
    const box = r.querySelector('.box');
    box.style.width = box.style.height = size + 'px';
    r.querySelector('.mark').style.transform = 'scale(' + (size / 26) + ')';
    // stroke is in 26-unit space; thicken when rendered small so it stays legible
    r.querySelector('.ring').setAttribute('stroke-width', size < T.smallBelowPx ? T.ring.strokeWidth.small : T.ring.strokeWidth.large);
    const label = this.getAttribute('label') || '';
    r.querySelector('.label').textContent = label;
    this.setAttribute('aria-label', label || 'Loading');
    const c = this.getAttribute('color');
    if (c) this.style.color = c; else this.style.removeProperty('color');
    this.style.setProperty('--d', (parseFloat(this.getAttribute('duration')) || m.durationMs) + 'ms');
  }
}

if (!customElements.get('ambit-loader')) customElements.define('ambit-loader', AmbitLoader);
