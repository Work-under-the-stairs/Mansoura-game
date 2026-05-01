export class OrientationGuard {
  private overlay: HTMLElement;

  constructor() {
    this.injectStyles();
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);

    window.addEventListener('resize', this.check);
    window.addEventListener('orientationchange', this.check);
    this.check();
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #orientation-guard {
        display: none;
        position: fixed;
        inset: 0;
        background: #0a0f19;
        /* Higher than tap-to-start (99999) and loading screen (9999) */
        z-index: 999999;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 24px;
        /* Block all interaction underneath */
        pointer-events: all;
        touch-action: none;
      }
      #orientation-guard.visible {
        display: flex;
      }
      #orientation-guard svg {
        animation: og-rotate 1.5s ease-in-out infinite alternate;
        filter: drop-shadow(0 0 12px rgba(232,201,122,0.4));
      }
      @keyframes og-rotate {
        from { transform: rotate(0deg); }
        to   { transform: rotate(-90deg); }
      }
      #orientation-guard p {
        color: #e8c97a;
        font-family: 'Cairo', sans-serif;
        font-size: 18px;
        margin: 0;
        opacity: 0.9;
        letter-spacing: 0.05em;
        direction: rtl;
      }
    `;
    document.head.appendChild(style);
  }

  private createOverlay(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'orientation-guard';
    div.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="8" width="28" height="36" rx="4"
          stroke="#e8c97a" stroke-width="2.5"/>
        <rect x="14" y="4" width="36" height="28" rx="4"
          stroke="rgba(232,201,122,0.35)" stroke-width="2"/>
        <path d="M38 16 L44 22 L38 28"
          stroke="rgba(232,201,122,0.7)" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
      <p>اقلب الشاشة للعب</p>
    `;
    return div;
  }

  private check = (): void => {
    const isPortrait = window.innerHeight > window.innerWidth;
    this.overlay.classList.toggle('visible', isPortrait);
  };

  public destroy(): void {
    window.removeEventListener('resize', this.check);
    window.removeEventListener('orientationchange', this.check);
    this.overlay.remove();
  }
}