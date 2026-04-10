import * as THREE from 'three';

export class LoadingScene {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private progressBar: HTMLElement;
  private progressText: HTMLElement;
  private tipText: HTMLElement;
  private diamonds: NodeListOf<HTMLElement> | null = null;
  private onCompleteCallback: (() => void) | null = null;

  private tips: string[] = [
    'جاري تحميل الخرائط...',
    'جاري تحميل موديلات الطائرات...',
    'جاري تحميل الأصوات والمؤثرات...',
    'جاري تحميل بيانات المعركة...',
    'استعد للإقلاع...',
  ];

  constructor(container: HTMLElement) {
    this.container = container;
    this.overlay = this.createOverlay();
    this.progressBar = this.overlay.querySelector('#ls-fill') as HTMLElement;
    this.progressText = this.overlay.querySelector('#ls-pct') as HTMLElement;
    this.tipText = this.overlay.querySelector('#ls-tip') as HTMLElement;
    this.diamonds = this.overlay.querySelectorAll('.ls-diamond');
  }

  // =============================
  //  HTML + CSS للشاشة
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

        /* الخلفية مع التظليل */
        #ls-bg {
          position: absolute;
          inset: 0;
          background-image: url('/images/loading-bg.png');
          background-size: cover;
          background-position: center;
          filter: brightness(0.55);
          z-index: 0;
        }

        /* gradient فوق الصورة */
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

        /* المحتوى */
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

        /* شريط التحميل */
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

        /* خطوط خفيفة داخل البار */
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

        /* الخط المضيء عند نهاية البار */
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

        /* الماسات */
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
          letter-spacing: 1px;
          text-align: center;
          min-height: 18px;
        }

        /* fade out عند الانتهاء */
        #loading-screen.fade-out {
          opacity: 0;
          transition: opacity 0.8s ease;
          pointer-events: none;
        }
      </style>

      <div id="ls-bg"></div>
      <div id="ls-gradient"></div>

      <div id="ls-content">
        <h1 id="ls-title">معركة المنصورة الجوية</h1>
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
          <div class="ls-diamond" id="d1"></div>
          <div class="ls-diamond" id="d2"></div>
          <div class="ls-diamond" id="d3"></div>
          <div class="ls-line"></div>
        </div>

        <p id="ls-tip">جاري تحميل الخرائط...</p>
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }

  // =============================
  //  تحديث الـ progress يدوياً
  //  (هتستخدميها مع THREE.LoadingManager)
  // =============================
  public updateProgress(progress: number): void {
    const clamped = Math.min(Math.max(progress, 0), 100);

    this.progressBar.style.width = clamped + '%';
    this.progressText.textContent = Math.round(clamped) + '%';

    // تحديث نص الـ tip
    const tipIndex = Math.floor((clamped / 100) * this.tips.length);
    this.tipText.textContent = this.tips[Math.min(tipIndex, this.tips.length - 1)];

    // تفعيل الماسات
    if (this.diamonds) {
      const activeCount = Math.floor((clamped / 100) * 3);
      this.diamonds.forEach((d, i) => {
        d.classList.toggle('active', i <= activeCount);
      });
    }
  }

  // =============================
  //  ربط مع THREE.LoadingManager
  // =============================
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

  // =============================
  //  إخفاء الشاشة
  // =============================
  public hide(): void {
    this.overlay.classList.add('fade-out');
    setTimeout(() => {
      this.overlay.remove();
      if (this.onCompleteCallback) this.onCompleteCallback();
    }, 800);
  }

  // =============================
  //  callback بعد الانتهاء
  // =============================
  public onComplete(callback: () => void): void {
    this.onCompleteCallback = callback;
  }
}