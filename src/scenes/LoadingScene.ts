import * as THREE from 'three';

export class LoadingScene {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private progressBar: HTMLElement;
  private progressText: HTMLElement;
  private tipText: HTMLElement;
  private diamonds: NodeListOf<HTMLElement> | null = null;
  private onCompleteCallback: (() => void) | null = null;

  private audio: HTMLAudioElement | null = null;

  private tips: string[] = [
    'جاري تحميل الخرائط...',
    'جاري تحميل موديلات الطائرات...',
    'جاري تحميل الأصوات والمؤثرات...',
    'جاري تحميل بيانات المعركة...',
    'استعد للإقلاع...',
  ];

  constructor(container: HTMLElement) {
    this.showTapToStart(); // 👆 show tap screen first
    this.container = container;
    this.overlay = this.createOverlay();
    this.progressBar = this.overlay.querySelector('#ls-fill') as HTMLElement;
    this.progressText = this.overlay.querySelector('#ls-pct') as HTMLElement;
    this.tipText = this.overlay.querySelector('#ls-tip') as HTMLElement;
    this.diamonds = this.overlay.querySelectorAll('.ls-diamond');
  }

  // =============================
  //  TAP TO START
  // =============================
  private showTapToStart(): void {
    const startScreen = document.createElement('div');
    startScreen.id = 'tap-to-start';
    startScreen.innerHTML = `
      <style>
        #tap-to-start {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0a0f19;
          font-family: 'Cairo', sans-serif;
          cursor: pointer;
          direction: rtl;
        }

        #tap-to-start .tap-logo {
          color: #e8c97a;
          font-size: 32px;
          font-weight: 900;
          letter-spacing: 4px;
          margin-bottom: 8px;
          text-align: center;
        }

        #tap-to-start .tap-date {
          color: rgba(255,255,255,0.3);
          font-size: 12px;
          letter-spacing: 6px;
          margin-bottom: 48px;
        }

        #tap-to-start .tap-icon {
          width: 48px;
          height: 48px;
          border: 1.5px solid rgba(232, 201, 122, 0.4);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          animation: tapPulse 1.6s ease-in-out infinite;
        }

        #tap-to-start .tap-icon svg {
          width: 20px;
          height: 20px;
          fill: #e8c97a;
        }

        #tap-to-start .tap-sub {
          color: rgba(255,255,255,0.4);
          font-size: 13px;
          letter-spacing: 4px;
          animation: tapPulse 1.6s ease-in-out infinite;
        }

        @keyframes tapPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      </style>

      <div class="tap-logo">معارك مصر الجوية</div>
      <div class="tap-date">١٤ أكتوبر ١٩٧٣</div>

      <div class="tap-icon">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 9v6l4 2V7L3 9zm13 3c0-1.77-1.02-3.29-2.5-4.03v8.06C14.98 15.29 16 13.77 16 12zm-8.5 0c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1-1 .45-1 1zm5 0c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4zm2.5-4.03v8.06C19.98 15.29 21 13.77 21 12s-1.02-3.29-2.5-4.03z"/>
        </svg>
      </div>

      <div class="tap-sub">اضغط للبدء</div>
    `;

    document.body.appendChild(startScreen);

    const unlock = () => {
      // Start music on user gesture — guaranteed to work
      this.initMusic();

      // Fade out tap screen
      startScreen.style.transition = 'opacity 0.6s ease';
      startScreen.style.opacity = '0';
      setTimeout(() => startScreen.remove(), 700);

      startScreen.removeEventListener('click', unlock);
      startScreen.removeEventListener('touchstart', unlock);
    };

    startScreen.addEventListener('click', unlock);
    startScreen.addEventListener('touchstart', unlock);
  }

  // =============================
  //  MUSIC SYSTEM
  // =============================
  private initMusic(): void {
    try {
      this.audio = new Audio('/sounds/1.MainTheme-320bit(chosic.com).m3');
      this.audio.loop = true;
      this.audio.volume = 0;

      this.audio.play().then(() => {
        this.fadeIn();
      }).catch((err) => {
        console.warn('Audio play failed:', err);
      });

    } catch (err) {
      console.warn('Audio init failed:', err);
    }
  }

  private fadeIn(): void {
    if (!this.audio) return;

    let vol = 0;
    const interval = setInterval(() => {
      vol += 0.02;
      if (this.audio) this.audio.volume = Math.min(vol, 0.5);

      if (vol >= 0.5) clearInterval(interval);
    }, 100);
  }

  private fadeOut(): void {
    if (!this.audio) return;

    let vol = this.audio.volume;
    const interval = setInterval(() => {
      vol -= 0.03;
      if (this.audio) this.audio.volume = Math.max(vol, 0);

      if (vol <= 0) {
        clearInterval(interval);
        this.audio?.pause();
        this.audio = null;
      }
    }, 80);
  }

  // =============================
  //  HTML + CSS
  // =============================
  private createOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'loading-screen';
    el.innerHTML = `
      <style>
        #loading-screen {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding-bottom: 80px;
          font-family: 'Cairo', sans-serif;
          overflow: hidden;
          direction: rtl;
        }

        #ls-bg {
          position: absolute;
          inset: 0;
          background-image: url('/images/loading-bg2.png');
          background-size: cover;
          background-position: center;
          filter: brightness(0.55);
          z-index: 0;
        }

        #ls-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            transparent 30%,
            rgba(10, 15, 25, 0.85) 100%
          );
          z-index: 1;
        }

        #ls-content {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 560px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 0 32px;
        }

        #ls-title {
          color: #e8c97a;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 4px;
          text-align: center;
          text-shadow: 0 0 30px rgba(232, 201, 122, 0.4);
          margin: 0;
        }

        #ls-subtitle {
          color: rgba(255,255,255,0.5);
          font-size: 12px;
          letter-spacing: 6px;
          margin: -8px 0 0;
        }

        #ls-bar-wrap {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        #ls-bar-labels {
          display: flex;
          justify-content: space-between;
        }

        .ls-bar-label {
          color: rgba(255,255,255,0.4);
          font-size: 10px;
          letter-spacing: 3px;
        }

        #ls-pct {
          color: #e8c97a;
          font-size: 13px;
          font-weight: 700;
        }

        #ls-bar-outer {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        #ls-bar-outer::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            90deg,
            rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 20px,
            transparent 20px, transparent 40px
          );
        }

        #ls-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #b8860b, #e8c97a, #fff5cc);
          border-radius: 2px;
          transition: width 0.25s ease;
          position: relative;
        }

        #ls-fill::after {
          content: '';
          position: absolute;
          right: -1px;
          top: -4px;
          width: 2px;
          height: 14px;
          background: #ffffff;
          border-radius: 1px;
          box-shadow: 0 0 8px #ffffff;
        }

        #ls-diamonds {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 4px;
        }

        .ls-line {
          width: 40px;
          height: 1px;
          background: rgba(232, 201, 122, 0.25);
        }

        .ls-diamond {
          width: 6px;
          height: 6px;
          background: #e8c97a;
          transform: rotate(45deg);
          opacity: 0.2;
          transition: opacity 0.3s;
        }

        .ls-diamond.active {
          opacity: 1;
        }

        #ls-tip {
          color: rgba(255,255,255,0.3);
          font-size: 12px;
          text-align: center;
        }

        #loading-screen.fade-out {
          opacity: 0;
          transition: opacity 0.8s ease;
          pointer-events: none;
        }
      </style>

      <div id="ls-bg"></div>
      <div id="ls-gradient"></div>

      <div id="ls-content">
        <h1 id="ls-title">معارك مصر الجوية</h1>
        <p id="ls-subtitle">١٤ أكتوبر ١٩٧٣</p>

        <div id="ls-bar-wrap">
          <div id="ls-bar-labels">
            <span class="ls-bar-label">LOADING ASSETS</span>
            <span id="ls-pct">0%</span>
          </div>
          <div id="ls-bar-outer">
            <div id="ls-fill"></div>
          </div>
        </div>

        <div id="ls-diamonds">
          <div class="ls-line"></div>
          <div class="ls-diamond"></div>
          <div class="ls-diamond"></div>
          <div class="ls-diamond"></div>
          <div class="ls-line"></div>
        </div>

        <p id="ls-tip">جاري تحميل الخرائط...</p>
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }

  public updateProgress(progress: number): void {
    const clamped = Math.min(Math.max(progress, 0), 100);

    this.progressBar.style.width = clamped + '%';
    this.progressText.textContent = Math.round(clamped) + '%';

    const tipIndex = Math.floor((clamped / 100) * this.tips.length);
    this.tipText.textContent = this.tips[Math.min(tipIndex, this.tips.length - 1)];

    if (this.diamonds) {
      const activeCount = Math.floor((clamped / 100) * 3);
      this.diamonds.forEach((d, i) => {
        d.classList.toggle('active', i <= activeCount);
      });
    }
  }

  public attachToLoadingManager(manager: THREE.LoadingManager): void {
    manager.onProgress = (_url, loaded, total) => {
      const progress = (loaded / total) * 100;
      this.updateProgress(progress);
    };

    manager.onLoad = () => {
      this.updateProgress(100);
      setTimeout(() => this.hide(), 600);
    };

    manager.onError = (url) => {
      console.error('فشل تحميل:', url);
    };
  }

  public hide(): void {
    this.fadeOut(); // 🎵 stop music

    this.overlay.classList.add('fade-out');

    setTimeout(() => {
      this.overlay.remove();
      if (this.onCompleteCallback) this.onCompleteCallback();
    }, 800);
  }

  public onComplete(callback: () => void): void {
    this.onCompleteCallback = callback;
  }
}