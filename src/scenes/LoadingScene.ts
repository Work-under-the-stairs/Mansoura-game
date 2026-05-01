import * as THREE from 'three';

export class LoadingScene {
  private container: HTMLElement;
  private overlay: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;
  private tipText: HTMLElement | null = null;
  private diamonds: NodeListOf<HTMLElement> | null = null;
  private onCompleteCallback: (() => void) | null = null;
  private loadingManager: THREE.LoadingManager | null = null;
  private audio: HTMLAudioElement | null = null;

  private isLoadFinished: boolean = false;
  // Only true when hide() is ACTUALLY scheduled — not just when onLoad fired
  private hideScheduled: boolean = false;

  private currentProgress: number = 0;
  private targetProgress: number = 0;
  private animFrame: number | null = null;
  private animationRunning: boolean = false;

  private pendingVolume: number | null = null;

  private tips: string[] = [
    'جاري تحميل الخرائط...',
    'جاري تحميل موديلات الطائرات...',
    'جاري تحميل الأصوات والمؤثرات...',
    'جاري تحميل بيانات المعركة...',
    'استعد للإقلاع...',
  ];

  constructor(container: HTMLElement) {
    this.container = container;
    this.showTapToStart();
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
          position: fixed; inset: 0; z-index: 99999;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          background: #0a0f19; font-family: 'Cairo', sans-serif; cursor: pointer; direction: rtl;
        }
        .tap-logo { color: #e8c97a; font-size: 32px; font-weight: 900; letter-spacing: 4px; margin-bottom: 8px; }
        .tap-date { color: rgba(255,255,255,0.3); font-size: 12px; letter-spacing: 6px; margin-bottom: 48px; }
        .tap-icon {
          width: 48px; height: 48px; border: 1.5px solid rgba(232, 201, 122, 0.4);
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          margin-bottom: 20px; animation: tapPulse 1.6s ease-in-out infinite;
        }
        .tap-sub { color: rgba(255,255,255,0.4); font-size: 13px; letter-spacing: 4px; animation: tapPulse 1.6s ease-in-out infinite; }
        @keyframes tapPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
      </style>
      <div class="tap-logo">معارك مصر الجوية</div>
      <div class="tap-date">١٤ أكتوبر ١٩٧٣</div>
      <div class="tap-icon">
        <svg width="24" height="24" fill="#e8c97a" viewBox="0 0 24 24">
          <path d="M3 9v6l4 2V7L3 9zm13 3c0-1.77-1.02-3.29-2.5-4.03v8.06C14.98 15.29 16 13.77 16 12z"/>
        </svg>
      </div>
      <div class="tap-sub">اضغط للبدء</div>
    `;

    document.body.appendChild(startScreen);

    const unlock = () => {
      console.log('[LoadingScene] User clicked. isLoadFinished=', this.isLoadFinished, 'hideScheduled=', this.hideScheduled);
      this.initMusic();
      this.overlay = this.createOverlay();

      this.progressBar  = document.getElementById('ls-fill');
      this.progressText = document.getElementById('ls-pct');
      this.tipText      = document.getElementById('ls-tip');
      this.diamonds     = document.querySelectorAll('.ls-diamond');

      this.startProgressAnimation();

      if (this.isLoadFinished && !this.hideScheduled) {
        // Loading finished before the user clicked AND nothing scheduled hide yet
        // → we own the hide responsibility now
        this.hideScheduled = true;
        this.targetProgress = 100;
        console.log('[LoadingScene] Scheduling hide from click handler (load already done)');
        setTimeout(() => {
          this.stopProgressAnimation();
          this.updateProgress(100);
          setTimeout(() => {
            console.log('[LoadingScene] Calling hide() — click-handler path');
            this.hide();
          }, 1500);
        }, 1200);
      } else if (!this.isLoadFinished) {
        // Still loading — just nudge the bar
        this.targetProgress = 1;
      }

      startScreen.style.transition = 'opacity 0.6s ease';
      startScreen.style.opacity = '0';
      setTimeout(() => startScreen.remove(), 700);
    };

    startScreen.addEventListener('click', unlock, { once: true });
  }

  // =============================
  //  SMOOTH PROGRESS ANIMATION
  // =============================
  private startProgressAnimation(): void {
    if (this.animationRunning) return;
    this.animationRunning = true;

    const loop = () => {
      if (!this.animationRunning) return;
      const diff = this.targetProgress - this.currentProgress;
      if (Math.abs(diff) > 0.05) {
        this.currentProgress += diff * 0.04 + (diff > 0 ? 0.08 : 0);
        if (this.currentProgress > this.targetProgress) this.currentProgress = this.targetProgress;
        this.updateProgress(this.currentProgress);
      } else if (this.currentProgress !== this.targetProgress) {
        this.currentProgress = this.targetProgress;
        this.updateProgress(this.currentProgress);
      }
      this.animFrame = requestAnimationFrame(loop);
    };

    this.animFrame = requestAnimationFrame(loop);
  }

  private stopProgressAnimation(): void {
    this.animationRunning = false;
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  // =============================
  //  THREE.JS MANAGER LINK
  // =============================
  public attachToLoadingManager(manager: THREE.LoadingManager): void {
    this.loadingManager = manager;

    manager.onProgress = (url, loaded, total) => {
      const progress = total > 0 ? (loaded / total) * 100 : 0;
      this.targetProgress = progress;
      console.log(`Loading target: ${progress.toFixed(0)}% (${loaded}/${total})`);
    };

    manager.onLoad = () => {
      this.isLoadFinished = true;
      this.targetProgress = 100;
      console.log('[LoadingScene] onLoad fired. overlay=', !!this.overlay, 'hideScheduled=', this.hideScheduled);

      if (this.hideScheduled) return; // already handled

      if (this.overlay) {
        // User already clicked — overlay exists, we schedule hide now
        this.hideScheduled = true;
        console.log('[LoadingScene] Scheduling hide from onLoad (overlay exists)');
        setTimeout(() => {
          this.stopProgressAnimation();
          this.updateProgress(100);
          setTimeout(() => {
            console.log('[LoadingScene] Calling hide() — onLoad path');
            this.hide();
          }, 1500);
        }, 1200);
      }
      // If no overlay: do NOT set hideScheduled — let the click handler do it
    };
  }

  // =============================
  //  UI UPDATES
  // =============================
  public updateProgress(progress: number): void {
    const val = Math.min(Math.max(progress, 0), 100);

    if (!this.progressBar) this.progressBar = document.getElementById('ls-fill');
    if (!this.progressText) this.progressText = document.getElementById('ls-pct');
    if (!this.tipText)      this.tipText      = document.getElementById('ls-tip');

    if (this.progressBar)  this.progressBar.style.width   = `${val}%`;
    if (this.progressText) this.progressText.innerText     = `${Math.round(val)}%`;

    if (this.tipText) {
      const idx = Math.floor((val / 100) * this.tips.length);
      this.tipText.innerText = this.tips[Math.min(idx, this.tips.length - 1)];
    }

    if (this.diamonds) {
      const activeIdx = Math.floor((val / 100) * 3);
      this.diamonds.forEach((d, i) => d.classList.toggle('active', i <= activeIdx));
    }
  }

  private createOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'loading-screen';
    el.innerHTML = `
      <style>
        #loading-screen {
          position: fixed; inset: 0; z-index: 9999; display: flex;
          flex-direction: column; align-items: center; justify-content: flex-end;
          padding-bottom: 80px; font-family: 'Cairo', sans-serif; direction: rtl;
        }
        #ls-bg {
          position: absolute; inset: 0; background: #0a0f19;
          background-image: url('/images/loading-bg2.png');
          background-size: cover; background-position: center;
          filter: brightness(0.4); z-index: 0;
        }
        #ls-content {
          position: relative; z-index: 2; width: 100%; max-width: 560px;
          display: flex; flex-direction: column; align-items: center;
          gap: 16px; padding: 0 32px;
        }
        #ls-bar-outer { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; }
        #ls-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #b8860b, #e8c97a, #fff); transition: none; }
        #ls-pct { color: #e8c97a; font-weight: 700; font-size: 14px; }
        .ls-diamond { width: 6px; height: 6px; background: #e8c97a; transform: rotate(45deg); opacity: 0.2; transition: opacity 0.3s; }
        .ls-diamond.active { opacity: 1; }
        #ls-tip { color: rgba(255,255,255,0.5); font-size: 13px; margin-top: 5px; }
        .fade-out { opacity: 0; transition: opacity 0.8s ease; pointer-events: none; }
      </style>
      <div id="ls-bg"></div>
      <div id="ls-content">
        <div style="display:flex; justify-content:space-between; width:100%; margin-bottom: 5px;">
          <span style="color:rgba(255,255,255,0.4); font-size:10px; letter-spacing:2px;">LOADING SYSTEM</span>
          <span id="ls-pct">0%</span>
        </div>
        <div id="ls-bar-outer"><div id="ls-fill"></div></div>
        <div style="display:flex; gap:12px; margin: 8px 0;">
          <div class="ls-diamond"></div><div class="ls-diamond"></div><div class="ls-diamond"></div>
        </div>
        <p id="ls-tip">جاري بدء التشغيل...</p>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  // =============================
  //  AUDIO
  // =============================
  private initMusic(): void {
    if (this.audio) return;
    this.audio = new Audio('/sounds/1.MainTheme-320bit(chosic.com).mp3');
    this.audio.loop = true;

    if (this.pendingVolume !== null) {
      this.audio.volume = this.pendingVolume;
      this.audio.play().catch(e => console.warn('Audio blocked', e));
    } else {
      this.audio.volume = 0;
      this.audio.play().then(() => this.fadeIn()).catch(e => console.warn('Audio blocked', e));
    }
  }

  private fadeIn(): void {
    let vol = 0;
    const inv = setInterval(() => {
      vol += 0.02;
      if (this.audio) this.audio.volume = Math.min(vol, 0.5);
      if (vol >= 0.5) clearInterval(inv);
    }, 100);
  }

  public setVolume(volume: number): void {
    const clamped = Math.min(Math.max(volume, 0), 1);
    this.pendingVolume = clamped;
    if (this.audio) this.audio.volume = clamped;
  }

  public getAudio(): HTMLAudioElement | null {
    return this.audio;
  }

  public hide(): void {
    console.log('[LoadingScene] hide() called. overlay=', !!this.overlay, 'onCompleteCallback=', !!this.onCompleteCallback);
    this.stopProgressAnimation();
    if (this.overlay) {
      this.overlay.classList.add('fade-out');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        console.log('[LoadingScene] Overlay removed — firing onCompleteCallback');
        if (this.onCompleteCallback) {
          this.onCompleteCallback();
        } else {
          console.warn('[LoadingScene] onCompleteCallback is NULL — nothing will happen!');
        }
      }, 850);
    } else {
      console.warn('[LoadingScene] hide() called but overlay is already null');
    }
  }

  public onComplete(cb: () => void): void {
    console.log('[LoadingScene] onComplete registered');
    this.onCompleteCallback = cb;
  }
}