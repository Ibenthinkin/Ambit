// <ambit-view-toggle> — Ambit gallery view button: single page ⇄ open magazine (spread)
// Usage: import './ambit-view-toggle.js';
//   <ambit-view-toggle value="spread" persist="ambit.galleryView.v1"></ambit-view-toggle>
//   el.addEventListener('viewchange', e => setMode(e.detail.mode)); // 'single' | 'spread'
// Attributes: value (single|spread, default spread) · persist (optional localStorage key) · hotkey (default "m", "" to disable)
// Also exports viewGlyphSVG(mode) and AMBIT_VIEW_TOKENS.

export const AMBIT_VIEW_TOKENS = {
  modes: [
    { id: 'single', label: 'Single view', pagesPerTurn: 1 },
    { id: 'spread', label: 'Magazine view', pagesPerTurn: 2 },
  ],
  default: 'spread',
  storageKey: 'ambit.galleryView.v1',
  glyph: {
    viewBox: '0 0 24 24',
    size: 24,
    ink: 'rgba(255,255,255,0.86)',
    // Same command structure in both modes so `d` interpolates.
    pages: {
      single: {
        left: 'M12 4C12 4 6.5 4 6.5 4V20C6.5 20 12 20 12 20Z',
        right: 'M12 4C12 4 17.5 4 17.5 4V20C17.5 20 12 20 12 20Z',
      },
      spread: {
        left: 'M11.3 6.4C8.8 5 5.8 4.6 2.5 5.3V18.9C5.8 18.2 8.8 18.6 11.3 20Z',
        right: 'M12.7 6.4C15.2 5 18.2 4.6 21.5 5.3V18.9C18.2 18.2 15.2 18.6 12.7 20Z',
      },
    },
    morph: { durationMs: 420, easing: 'cubic-bezier(.3,1.3,.5,1)' },
  },
  button: { size: 36, radius: 10, activeBg: 'rgba(255,255,255,0.14)', focus: '#A8AEFF' },
  spread: {
    perspective: 2800,
    spine: { width: 90, gradient: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 34%, rgba(0,0,0,0.42) 49%, rgba(255,255,255,0.06) 50.5%, rgba(0,0,0,0.2) 56%, rgba(0,0,0,0) 100%)' },
    pageTurn: { durationMs: 800, easing: 'cubic-bezier(.45,.05,.25,1)', commitMs: 820 },
  },
};

const T = AMBIT_VIEW_TOKENS;
const VALID = T.modes.map(m => m.id);

export function viewGlyphSVG(mode, { size = T.glyph.size, ink = T.glyph.ink } = {}) {
  const p = T.glyph.pages[mode] || T.glyph.pages.spread;
  return `<svg width="${size}" height="${size}" viewBox="${T.glyph.viewBox}" aria-hidden="true"><path d="${p.left}" fill="${ink}"/><path d="${p.right}" fill="${ink}"/></svg>`;
}

class AmbitViewToggle extends HTMLElement {
  static get observedAttributes() { return ['value']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._onKey = e => {
      const k = this.hasAttribute('hotkey') ? this.getAttribute('hotkey') : 'm';
      if (!k || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key.toLowerCase() === k.toLowerCase()) this.toggle();
    };
  }
  get value() { const v = this.getAttribute('value'); return VALID.includes(v) ? v : T.default; }
  set value(v) { this.setAttribute('value', v); }

  connectedCallback() {
    const key = this.getAttribute('persist');
    if (key && !this.hasAttribute('value')) {
      try { const v = localStorage.getItem(key); if (VALID.includes(v)) this.setAttribute('value', v); } catch (e) {}
    }
    this._render();
    document.addEventListener('keydown', this._onKey);
  }
  disconnectedCallback() { document.removeEventListener('keydown', this._onKey); }
  attributeChangedCallback() { if (this._btn) this._sync(); }

  toggle() {
    const mode = this.value === 'spread' ? 'single' : 'spread';
    this.value = mode;
    const key = this.getAttribute('persist');
    if (key) { try { localStorage.setItem(key, mode); } catch (e) {} }
    this.dispatchEvent(new CustomEvent('viewchange', { detail: { mode }, bubbles: true, composed: true }));
  }

  _render() {
    const { glyph, button } = T;
    const m = glyph.morph;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:inline-flex; }
        button { all:unset; width:${button.size}px; height:${button.size}px; display:flex; align-items:center; justify-content:center; border-radius:${button.radius}px; cursor:pointer; transition:background .2s ease; }
        button[aria-pressed="true"] { background:${button.activeBg}; }
        button:focus-visible { outline:2px solid ${button.focus}; outline-offset:2px; }
        path { transition: d ${m.durationMs}ms ${m.easing}; }
      </style>
      <button part="button" aria-pressed="false">
        <svg width="${glyph.size}" height="${glyph.size}" viewBox="${glyph.viewBox}" aria-hidden="true">
          <path class="l" fill="${glyph.ink}"/><path class="r" fill="${glyph.ink}"/>
        </svg>
      </button>`;
    this._btn = this.shadowRoot.querySelector('button');
    this._btn.addEventListener('click', () => this.toggle());
    this._sync(true);
  }

  _sync(instant) {
    const mode = this.value;
    const p = T.glyph.pages[mode];
    const label = mode === 'spread' ? 'Switch to single view' : 'Switch to magazine view';
    this._btn.setAttribute('aria-pressed', String(mode === 'spread'));
    this._btn.setAttribute('aria-label', label);
    this._btn.title = label;
    [['.l', p.left], ['.r', p.right]].forEach(([sel, d]) => {
      const el = this.shadowRoot.querySelector(sel);
      if (instant) el.style.transition = 'none';
      el.style.d = `path('${d}')`;      // animates where CSS `d` is supported
      el.setAttribute('d', d);           // fallback: instant swap
      if (instant) requestAnimationFrame(() => (el.style.transition = ''));
    });
  }
}

if (!customElements.get('ambit-view-toggle')) customElements.define('ambit-view-toggle', AmbitViewToggle);
export default AmbitViewToggle;
