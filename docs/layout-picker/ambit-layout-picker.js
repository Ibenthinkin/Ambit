// <ambit-layout-picker> — Ambit feed layout button + pick list (4 / 2 / 1 columns)
// Usage: import './ambit-layout-picker.js';
//   <ambit-layout-picker value="4" placement="left"></ambit-layout-picker>
//   el.addEventListener('layoutchange', e => setColumns(e.detail.cols));
// Attributes: value (4|2|1, default 4) · placement (left|right|top|bottom, default left)
//             persist (optional localStorage key, e.g. "ambit.feedLayout.v1")
// Also exports layoutGlyphSVG(cols) for static use and AMBIT_LAYOUT_TOKENS.

export const AMBIT_LAYOUT_TOKENS = {
  layouts: [
    { cols: 4, label: '4 columns', feedMaxWidth: 1112 },
    { cols: 2, label: '2 columns', feedMaxWidth: 820 },
    { cols: 1, label: '1 column', feedMaxWidth: 560 },
  ],
  feed: { gap: 4, storageKey: 'ambit.feedLayout.v1' },
  glyph: {
    viewBox: '0 0 24 24',
    size: 24,
    bar: { y: 4, height: 16, rx: 1.2 },
    // Always 4 rects so the glyph can morph; overlapping rects merge into wider bars. [x, width]
    bars: {
      4: [[3, 2.4], [8.2, 2.4], [13.4, 2.4], [18.6, 2.4]],
      2: [[3, 7.6], [3, 7.6], [13.4, 7.6], [13.4, 7.6]],
      1: [[5.5, 13], [5.5, 13], [5.5, 13], [5.5, 13]],
    },
    ink: 'rgba(255,255,255,0.86)',
    morph: { durationMs: 320, easing: 'cubic-bezier(.3,1.3,.5,1)' },
  },
  button: { size: 36, radius: 10, activeBg: 'rgba(255,255,255,0.14)' },
  menu: {
    width: 212, offset: 14, radius: 16, padding: 6,
    bg: 'rgba(27,24,21,0.94)', blur: 20, border: '0.5px solid rgba(239,235,224,0.12)',
    shadow: '0 18px 44px rgba(0,0,0,0.5)',
    enter: { durationMs: 180, easing: 'ease', distance: 6 },
    heading: { text: 'Layout', size: 10, weight: 600, tracking: 1.4, color: 'rgba(239,235,224,0.38)' },
    row: { padding: '11px 12px', radius: 10, gap: 12, labelSize: 14, labelColor: '#EFEBE0', iconSize: 22 },
    selected: { ink: '#A8AEFF', bg: 'rgba(168,174,255,0.1)', check: '#A8AEFF' },
    unselectedInk: 'rgba(239,235,224,0.7)',
  },
  font: "'Sora', sans-serif",
};

const L = AMBIT_LAYOUT_TOKENS;
const VALID = L.layouts.map(l => l.cols);

export function layoutGlyphSVG(cols, { size = L.glyph.size, ink = L.glyph.ink } = {}) {
  const { y, height, rx } = L.glyph.bar;
  const rects = (L.glyph.bars[cols] || L.glyph.bars[4])
    .map(([x, w]) => `<rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${rx}" fill="${ink}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="${L.glyph.viewBox}" aria-hidden="true">${rects}</svg>`;
}

class AmbitLayoutPicker extends HTMLElement {
  static get observedAttributes() { return ['value', 'placement']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
    this._onDoc = e => { if (this._open && !e.composedPath().includes(this)) this.close(); };
    this._onKey = e => { if (e.key === 'Escape') this.close(); };
  }
  get value() {
    const v = parseInt(this.getAttribute('value'), 10);
    return VALID.includes(v) ? v : 4;
  }
  set value(v) { this.setAttribute('value', String(v)); }

  connectedCallback() {
    const key = this.getAttribute('persist');
    if (key && !this.hasAttribute('value')) {
      try { const v = parseInt(localStorage.getItem(key), 10); if (VALID.includes(v)) this.setAttribute('value', String(v)); } catch (e) {}
    }
    this._render();
    document.addEventListener('pointerdown', this._onDoc, true);
    document.addEventListener('keydown', this._onKey);
  }
  disconnectedCallback() {
    document.removeEventListener('pointerdown', this._onDoc, true);
    document.removeEventListener('keydown', this._onKey);
  }
  attributeChangedCallback(name) {
    if (!this.shadowRoot.firstChild) return;
    if (name === 'value') { this._morph(); this._renderMenu(); } else this._render();
  }

  open() { this._open = true; this._renderMenu(); this._btn.setAttribute('aria-expanded', 'true'); }
  close() { this._open = false; this._renderMenu(); this._btn?.setAttribute('aria-expanded', 'false'); }
  toggle() { this._open ? this.close() : this.open(); }

  _pick(cols) {
    const changed = cols !== this.value;
    this.value = cols;
    const key = this.getAttribute('persist');
    if (key) { try { localStorage.setItem(key, String(cols)); } catch (e) {} }
    this.close();
    if (changed) this.dispatchEvent(new CustomEvent('layoutchange', { detail: { cols }, bubbles: true, composed: true }));
  }

  _pos() {
    const p = this.getAttribute('placement') || 'left';
    const o = L.menu.offset + 'px';
    return {
      left: `right:calc(100% + ${o}); top:50%; --tx:${L.menu.enter.distance}px; --ty:0; --base:translateY(-50%);`,
      right: `left:calc(100% + ${o}); top:50%; --tx:-${L.menu.enter.distance}px; --ty:0; --base:translateY(-50%);`,
      top: `bottom:calc(100% + ${o}); left:50%; --tx:0; --ty:${L.menu.enter.distance}px; --base:translateX(-50%);`,
      bottom: `top:calc(100% + ${o}); left:50%; --tx:0; --ty:-${L.menu.enter.distance}px; --base:translateX(-50%);`,
    }[p] || '';
  }

  _render() {
    const { glyph, button, menu, font } = L;
    const m = glyph.morph;
    this.shadowRoot.innerHTML = `
      <style>
        :host { position:relative; display:inline-flex; font-family:${font}; }
        button { all:unset; width:${button.size}px; height:${button.size}px; display:flex; align-items:center; justify-content:center; border-radius:${button.radius}px; cursor:pointer; transition:background .15s ease; }
        button[aria-expanded="true"] { background:${button.activeBg}; }
        button:focus-visible { outline:2px solid ${menu.selected.ink}; outline-offset:2px; }
        .g rect { transition: x ${m.durationMs}ms ${m.easing}, width ${m.durationMs}ms ${m.easing}; }
        .menu { position:absolute; ${this._pos()} z-index:40; width:${menu.width}px; padding:${menu.padding}px; border-radius:${menu.radius}px;
          background:${menu.bg}; backdrop-filter:blur(${menu.blur}px); -webkit-backdrop-filter:blur(${menu.blur}px); border:${menu.border}; box-shadow:${menu.shadow};
          transform:var(--base); animation:enter ${menu.enter.durationMs}ms ${menu.enter.easing} both; }
        @keyframes enter { from { opacity:0; transform:var(--base) translate(var(--tx), var(--ty)); } to { opacity:1; transform:var(--base); } }
        .h { font-size:${menu.heading.size}px; font-weight:${menu.heading.weight}; letter-spacing:${menu.heading.tracking}px; text-transform:uppercase; color:${menu.heading.color}; padding:10px 12px 6px; }
        .row { all:unset; box-sizing:border-box; width:100%; display:flex; align-items:center; gap:${menu.row.gap}px; padding:${menu.row.padding}; border-radius:${menu.row.radius}px; cursor:pointer; }
        .row:hover { background:rgba(239,235,224,0.05); }
        .row[aria-checked="true"] { background:${menu.selected.bg}; }
        .row:focus-visible { outline:2px solid ${menu.selected.ink}; }
        .lbl { flex:1; font-size:${menu.row.labelSize}px; color:${menu.row.labelColor}; }
      </style>
      <button part="button" aria-label="Change layout" aria-haspopup="menu" aria-expanded="false">
        <svg class="g" width="${glyph.size}" height="${glyph.size}" viewBox="${glyph.viewBox}" aria-hidden="true">
          ${[0, 1, 2, 3].map(() => `<rect y="${glyph.bar.y}" height="${glyph.bar.height}" rx="${glyph.bar.rx}" fill="${glyph.ink}"/>`).join('')}
        </svg>
      </button>
      <div class="slot"></div>`;
    this._btn = this.shadowRoot.querySelector('button');
    this._btn.addEventListener('click', () => this.toggle());
    this._morph(true);
    this._renderMenu();
  }

  _morph(instant) {
    const rects = this.shadowRoot.querySelectorAll('.g rect');
    const bars = L.glyph.bars[this.value];
    rects.forEach((r, i) => {
      if (instant) r.style.transition = 'none';
      r.style.x = bars[i][0] + 'px'; r.style.width = bars[i][1] + 'px';
      r.setAttribute('x', bars[i][0]); r.setAttribute('width', bars[i][1]);
      if (instant) requestAnimationFrame(() => (r.style.transition = ''));
    });
  }

  _renderMenu() {
    const slot = this.shadowRoot.querySelector('.slot');
    if (!slot) return;
    if (!this._open) { slot.innerHTML = ''; return; }
    const { menu } = L;
    slot.innerHTML = `<div class="menu" part="menu" role="menu"><div class="h">${menu.heading.text}</div>${L.layouts.map(l => {
      const sel = l.cols === this.value;
      return `<button class="row" role="menuitemradio" aria-checked="${sel}" data-cols="${l.cols}">
        ${layoutGlyphSVG(l.cols, { size: menu.row.iconSize, ink: sel ? menu.selected.ink : menu.unselectedInk })}
        <span class="lbl">${l.label}</span>
        ${sel ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${menu.selected.check}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>` : ''}
      </button>`;
    }).join('')}</div>`;
    slot.querySelectorAll('.row').forEach(b => b.addEventListener('click', () => this._pick(parseInt(b.dataset.cols, 10))));
    slot.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  }
}

if (!customElements.get('ambit-layout-picker')) customElements.define('ambit-layout-picker', AmbitLayoutPicker);
export default AmbitLayoutPicker;
