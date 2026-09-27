// <ambit-spread> — magazine-style image viewer with a 3D page turn around the spine.
// Usage: import './ambit-spread.js';
//   const s = document.querySelector('ambit-spread');
//   s.items = [{ src, title, maker }, ...];
//   s.addEventListener('pagechange', e => console.log(e.detail)); // { index, mode }
// Attributes: mode (spread|single, default spread) · index (default 0) · folios (show captions)
//             keyboard (arrow keys / space) · clickzones (click left/right half to turn, default on; "off" disables)
//             loop (default on; "off" clamps at ends) · duration (page turn ms, default 800)
// Methods: next() · prev() · goTo(i) · setMode(mode)
// Size it with CSS (it fills its box). Theme via --ambit-spread-bg, --ambit-spread-ink, --ambit-spread-muted, --ambit-spread-font.

export const AMBIT_SPREAD_TOKENS = {
  perspective: 2800,
  pageTurn: { durationMs: 800, easing: 'cubic-bezier(.45,.05,.25,1)' },
  single: { durationMs: 350, easing: 'ease' },
  spine: {
    width: 90,
    gradient: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 34%, rgba(0,0,0,0.42) 49%, rgba(255,255,255,0.06) 50.5%, rgba(0,0,0,0.2) 56%, rgba(0,0,0,0) 100%)',
  },
  folio: { height: 56, gap: 48 },
};

const T = AMBIT_SPREAD_TOKENS;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

class AmbitSpread extends HTMLElement {
  static get observedAttributes() { return ['mode', 'index', 'folios']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
    this._busy = false;
    this._onKey = e => {
      if (!this.hasAttribute('keyboard')) return;
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); this.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
    };
  }

  get items() { return this._items; }
  set items(v) { this._items = Array.isArray(v) ? v : []; this._paint(); }
  get mode() { return this.getAttribute('mode') === 'single' ? 'single' : 'spread'; }
  get index() { return parseInt(this.getAttribute('index'), 10) || 0; }
  get _loop() { return this.getAttribute('loop') !== 'off'; }
  get _dur() { return parseInt(this.getAttribute('duration'), 10) || T.pageTurn.durationMs; }

  connectedCallback() {
    this._build();
    document.addEventListener('keydown', this._onKey);
  }
  disconnectedCallback() { document.removeEventListener('keydown', this._onKey); clearTimeout(this._t); }
  attributeChangedCallback() { if (this._stage && !this._busy) this._paint(); }

  _n() { return this._items.length; }
  _i(k) { const n = this._n(); return n ? ((k % n) + n) % n : 0; }
  _get(k) { return this._items[this._i(k)] || {}; }
  _can(k) { return this._loop || (k >= 0 && k < this._n()); }

  next() { this._turn(1); }
  prev() { this._turn(-1); }
  goTo(i) { if (!this._busy) this._setIndex(i); }
  setMode(mode) {
    if (this._busy) return;
    this.setAttribute('mode', mode === 'single' ? 'single' : 'spread');
    this._emit();
  }

  _setIndex(i) {
    this.setAttribute('index', String(this._loop ? i : Math.max(0, Math.min(i, this._n() - 1))));
    this._emit();
  }
  _emit() { this.dispatchEvent(new CustomEvent('pagechange', { detail: { index: this._i(this.index), mode: this.mode }, bubbles: true, composed: true })); }

  _turn(dir) {
    if (this._busy || !this._n()) return;
    const i = this.index;
    if (this.mode === 'single') {
      if (!this._can(i + dir)) return;
      return this._setIndex(i + dir);
    }
    // spread: need both pages of the next spread's leading page to exist
    if (!this._can(dir > 0 ? i + 2 : i - 2)) return;
    this._busy = true;
    const next = dir > 0;
    const front = this._get(next ? i + 1 : i);
    const back = this._get(next ? i + 2 : i - 1);
    // base pages revealed underneath the turning leaf
    if (next) this._setImg(this._R, this._get(i + 3)); else this._setImg(this._L, this._get(i - 2));
    const leaf = this._leaf;
    leaf.className = 'leaf ' + (next ? 'fromR' : 'fromL');
    this._setImg(leaf.querySelector('.front img'), front);
    this._setImg(leaf.querySelector('.back img'), back);
    leaf.style.transition = 'none';
    leaf.style.transform = 'rotateY(0deg)';
    leaf.hidden = false;
    this._folios.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      leaf.style.transition = `transform ${this._dur}ms ${T.pageTurn.easing}`;
      leaf.style.transform = `rotateY(${next ? -180 : 180}deg)`;
    }));
    this._t = setTimeout(() => {
      this._busy = false;
      leaf.hidden = true;
      this._setIndex(i + dir * 2);
    }, this._dur + 20);
  }

  _setImg(img, it) {
    if (!img) return;
    if (!it || !it.src) { img.removeAttribute('src'); img.style.visibility = 'hidden'; return; }
    if (img.getAttribute('src') !== it.src) img.src = it.src;
    img.alt = it.title || '';
    img.style.visibility = '';
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; position:relative; overflow:hidden; background:var(--ambit-spread-bg, #0C0B09); font-family:var(--ambit-spread-font, 'Sora', sans-serif); }
        .stage { position:absolute; inset:0; perspective:${T.perspective}px; }
        :host([folios]) .stage { bottom:${T.folio.height + 24}px; }
        .half { position:absolute; top:0; bottom:0; width:50%; }
        .half.l { left:0; } .half.r { left:50%; }
        img { width:100%; height:100%; object-fit:contain; display:block; user-select:none; -webkit-user-drag:none; }
        .l img, .fromL .front img, .fromR .back img { object-position:right center; }
        .r img, .fromR .front img, .fromL .back img { object-position:left center; }
        .spine { position:absolute; top:0; bottom:0; left:50%; width:${T.spine.width}px; transform:translateX(-50%); background:${T.spine.gradient}; pointer-events:none; z-index:3; }
        .leaf { position:absolute; top:0; bottom:0; width:50%; z-index:5; pointer-events:none; transform-style:preserve-3d; }
        .leaf.fromR { left:50%; transform-origin:left center; }
        .leaf.fromL { left:0; transform-origin:right center; }
        .face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; }
        .back { transform:rotateY(180deg); }
        .single { position:absolute; inset:0; }
        .single img { animation:in ${T.single.durationMs}ms ${T.single.easing} both; }
        @keyframes in { from { opacity:0; } to { opacity:1; } }
        :host([mode="single"]) .spread, :host(:not([mode="single"])) .single { display:none; }
        .zone { position:absolute; top:0; bottom:0; width:50%; z-index:8; }
        .zone.p { left:0; cursor:w-resize; } .zone.n { right:0; cursor:e-resize; }
        :host([clickzones="off"]) .zone { display:none; }
        .folios { position:absolute; left:0; right:0; bottom:0; height:${T.folio.height}px; display:none; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:${T.folio.gap}px; align-items:end; transition:opacity .3s ease; }
        :host([folios]) .folios { display:grid; }
        :host([mode="single"]) .folios { grid-template-columns:1fr; text-align:center; }
        .f { display:flex; align-items:baseline; gap:14px; min-width:0; }
        .f.r { justify-content:flex-end; text-align:right; }
        :host([mode="single"]) .f { justify-content:center; }
        :host([mode="single"]) .f.r, :host([mode="single"]) .num { display:none; }
        .num { font-size:11px; font-weight:600; letter-spacing:1.2px; color:var(--ambit-spread-muted, rgba(239,235,224,0.4)); font-variant-numeric:tabular-nums; }
        .t { font-size:14px; color:var(--ambit-spread-ink, #EFEBE0); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .m { font-family:-apple-system, system-ui, sans-serif; font-size:11.5px; color:var(--ambit-spread-muted, rgba(239,235,224,0.46)); margin-top:3px; }
        .f > div { min-width:0; }
      </style>
      <div class="stage" part="stage">
        <div class="single"></div>
        <div class="spread">
          <div class="half l" part="page"><img></div>
          <div class="half r" part="page"><img></div>
          <div class="spine" part="spine"></div>
          <div class="leaf" hidden><div class="face front"><img></div><div class="face back"><img></div></div>
        </div>
        <div class="zone p" aria-hidden="true"></div>
        <div class="zone n" aria-hidden="true"></div>
      </div>
      <div class="folios" part="folios"><div class="f l"></div><div class="f r"></div></div>`;
    const $ = s => this.shadowRoot.querySelector(s);
    this._stage = $('.stage');
    this._single = $('.single');
    this._L = $('.half.l img');
    this._R = $('.half.r img');
    this._leaf = $('.leaf');
    this._folios = $('.folios');
    $('.zone.p').addEventListener('click', () => this.prev());
    $('.zone.n').addEventListener('click', () => this.next());
    this._paint();
  }

  _folio(k, side) {
    const it = this._get(k);
    if (!it.src) return '';
    const num = `<span class="num">${String(this._i(k) + 1).padStart(2, '0')}</span>`;
    const txt = `<div><div class="t">${esc(it.title)}</div><div class="m">${esc(it.maker)}</div></div>`;
    return side === 'r' ? txt + num : num + txt;
  }

  _paint() {
    if (!this._stage) return;
    const i = this.index;
    if (this.mode === 'single') {
      const it = this._get(i);
      this._single.innerHTML = it.src ? `<img src="${esc(it.src)}" alt="${esc(it.title)}">` : '';
    } else {
      this._setImg(this._L, this._get(i));
      this._setImg(this._R, this._can(i + 1) ? this._get(i + 1) : null);
    }
    this.shadowRoot.querySelector('.f.l').innerHTML = this._folio(i, 'l');
    this.shadowRoot.querySelector('.f.r').innerHTML = this._can(i + 1) ? this._folio(i + 1, 'r') : '';
    this._folios.style.opacity = '1';
  }
}

if (!customElements.get('ambit-spread')) customElements.define('ambit-spread', AmbitSpread);
export default AmbitSpread;
