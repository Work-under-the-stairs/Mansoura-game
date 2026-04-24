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
        background: #000;
        z-index: 99999;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 20px;
      }
      #orientation-guard.visible {
        display: flex;
      }
      #orientation-guard svg {
        animation: og-rotate 1.5s ease-in-out infinite alternate;
      }
      @keyframes og-rotate {
        from { transform: rotate(0deg); }
        to   { transform: rotate(-90deg); }
      }
      #orientation-guard p {
        color: #fff;
        font-family: sans-serif;
        font-size: 18px;
        margin: 0;
        opacity: 0.85;
        letter-spacing: 0.03em;
      }
    `;
    document.head.appendChild(style);
  }

  private createOverlay(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'orientation-guard';
    div.innerHTML = `
      <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="8" width="28" height="36" rx="4" 
          stroke="white" stroke-width="2.5"/>
        <rect x="14" y="4" width="36" height="28" rx="4" 
          stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
        <path d="M38 16 L44 22 L38 28" 
          stroke="rgba(255,255,255,0.6)" stroke-width="2" 
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