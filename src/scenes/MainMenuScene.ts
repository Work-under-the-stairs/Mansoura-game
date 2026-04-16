export class MainMenuScene {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private onStartCallback: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.overlay = this.createMenu();
  }

  private createMenu(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'main-menu';
    el.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');

        #main-menu {
          position: fixed;
          inset: 0;
          z-index: 9000;
          font-family: 'Cairo', sans-serif;
          direction: rtl;
          overflow: hidden;
          opacity: 0;
          transition: opacity 0.9s ease;
        }

        #main-menu.visible {
          opacity: 1;
        }

        /* Background image */
        #mm-bg {
          position: absolute;
          inset: 0;
          background-image: url('/images/menu-bg.png');
          background-size: cover;
          background-position: center top;
          z-index: 0;
          transform: scale(1.04);
          animation: mm-slow-zoom 20s ease-in-out infinite alternate;
        }

        @keyframes mm-slow-zoom {
          from { transform: scale(1.04) translateX(0px); }
          to   { transform: scale(1.10) translateX(-18px); }
        }

        /* Dark cinematic gradient */
        #mm-vignette {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to bottom,
              rgba(4, 8, 16, 0.55) 0%,
              rgba(4, 8, 16, 0.15) 35%,
              rgba(4, 8, 16, 0.20) 55%,
              rgba(4, 8, 16, 0.82) 100%
            ),
            radial-gradient(ellipse at center, transparent 40%, rgba(4,8,16,0.5) 100%);
          z-index: 1;
        }

        /* Scanline texture overlay */
        #mm-scanlines {
          position: absolute;
          inset: 0;
          z-index: 2;
          background: repeating-linear-gradient(
            0deg,
            rgba(0,0,0,0.03) 0px,
            rgba(0,0,0,0.03) 1px,
            transparent 1px,
            transparent 3px
          );
          pointer-events: none;
        }

        /* Golden top border line */
        #mm-topline {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, #c9a84c, #f0d080, #c9a84c, transparent);
          z-index: 10;
        }

        /* Bottom golden line */
        #mm-bottomline {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #c9a84c 30%, #c9a84c 70%, transparent);
          z-index: 10;
        }

        /* Main layout */
        #mm-layout {
          position: relative;
          z-index: 5;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 48px 32px 60px;
          box-sizing: border-box;
        }

        /* ── TOP HEADER ── */
        #mm-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          opacity: 0;
          transform: translateY(-24px);
          animation: mm-slide-down 0.9s ease forwards 0.3s;
        }

        @keyframes mm-slide-down {
          to { opacity: 1; transform: translateY(0); }
        }

        #mm-eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #c9a84c;
          font-size: 11px;
          letter-spacing: 6px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .mm-line-ornament {
          width: 48px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #c9a84c);
        }
        .mm-line-ornament.flip {
          transform: scaleX(-1);
        }

        #mm-title {
          font-size: clamp(32px, 5vw, 64px);
          font-weight: 900;
          color: #ffffff;
          text-align: center;
          margin: 0;
          letter-spacing: 2px;
          line-height: 1.15;
          text-shadow:
            0 0 60px rgba(201, 168, 76, 0.35),
            0 2px 4px rgba(0,0,0,0.8);
        }

        #mm-title span {
          color: #f0d080;
        }

        #mm-subtitle {
          font-size: 13px;
          color: rgba(255,255,255,0.45);
          letter-spacing: 8px;
          font-weight: 400;
          text-align: center;
          margin: 0;
        }

        /* diamond divider */
        #mm-divider {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }
        .mm-div-line {
          width: 80px;
          height: 1px;
          background: rgba(201, 168, 76, 0.3);
        }
        .mm-div-diamond {
          width: 7px;
          height: 7px;
          background: #c9a84c;
          transform: rotate(45deg);
        }
        .mm-div-diamond.sm {
          width: 4px;
          height: 4px;
          opacity: 0.5;
        }

        /* ── CENTER CONTENT ── */
        #mm-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          opacity: 0;
          animation: mm-fade-up 1s ease forwards 0.7s;
        }

        @keyframes mm-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Main start button */
        #mm-start-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 0 56px;
          height: 68px;
          background: transparent;
          border: none;
          cursor: pointer;
          outline: none;
          font-family: 'Cairo', sans-serif;
        }

        #mm-start-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          border: 1.5px solid rgba(201, 168, 76, 0.7);
          clip-path: polygon(16px 0%, calc(100% - 16px) 0%, 100% 50%, calc(100% - 16px) 100%, 16px 100%, 0% 50%);
          transition: all 0.3s ease;
        }

        #mm-start-btn::after {
          content: '';
          position: absolute;
          inset: 3px;
          background: linear-gradient(135deg, rgba(201, 168, 76, 0.18), rgba(201, 168, 76, 0.05));
          clip-path: polygon(14px 0%, calc(100% - 14px) 0%, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0% 50%);
          transition: all 0.3s ease;
        }

        #mm-start-btn:hover::before {
          border-color: #f0d080;
          box-shadow: 0 0 30px rgba(240, 208, 128, 0.3);
        }

        #mm-start-btn:hover::after {
          background: linear-gradient(135deg, rgba(201, 168, 76, 0.35), rgba(201, 168, 76, 0.15));
        }

        #mm-start-btn:active {
          transform: scale(0.97);
        }

        .mm-btn-icon {
          position: relative;
          z-index: 1;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 7px 0 7px 12px;
          border-color: transparent transparent transparent #f0d080;
          transition: transform 0.3s ease;
        }

        #mm-start-btn:hover .mm-btn-icon {
          transform: translateX(-3px);
        }

        .mm-btn-text {
          position: relative;
          z-index: 1;
          font-size: 20px;
          font-weight: 700;
          color: #f0d080;
          letter-spacing: 3px;
          text-shadow: 0 0 20px rgba(240, 208, 128, 0.5);
          transition: color 0.3s;
        }

        #mm-start-btn:hover .mm-btn-text {
          color: #fff8dc;
        }

        /* Secondary buttons row */
        #mm-secondary-btns {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .mm-sec-btn {
          position: relative;
          padding: 10px 28px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 2px;
          color: rgba(255,255,255,0.55);
          font-family: 'Cairo', sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .mm-sec-btn:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.85);
        }

        /* Quit button */
        #mm-quit-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 10px 32px;
          background: transparent;
          border: 1px solid rgba(180, 50, 50, 0.45);
          border-radius: 2px;
          color: rgba(220, 100, 100, 0.7);
          font-family: 'Cairo', sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        #mm-quit-btn:hover {
          background: rgba(180, 50, 50, 0.12);
          border-color: rgba(220, 80, 80, 0.7);
          color: rgba(255, 130, 130, 0.95);
        }

        #mm-quit-btn:active {
          transform: scale(0.97);
        }

        .mm-quit-icon {
          width: 10px;
          height: 10px;
          position: relative;
          flex-shrink: 0;
        }

        .mm-quit-icon::before,
        .mm-quit-icon::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 1.5px;
          background: currentColor;
          top: 50%;
          left: 0;
        }

        .mm-quit-icon::before { transform: translateY(-50%) rotate(45deg); }
        .mm-quit-icon::after  { transform: translateY(-50%) rotate(-45deg); }

        /* ── CONFIRM DIALOG ── */
        #mm-confirm-overlay {
          position: absolute;
          inset: 0;
          z-index: 20;
          background: rgba(4, 8, 16, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        #mm-confirm-overlay.active {
          opacity: 1;
          pointer-events: all;
        }

        #mm-confirm-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: 40px 52px;
          border: 1px solid rgba(201, 168, 76, 0.3);
          border-top: 2px solid rgba(201, 168, 76, 0.6);
          background: rgba(8, 14, 24, 0.92);
          transform: translateY(10px);
          transition: transform 0.3s ease;
          text-align: center;
        }

        #mm-confirm-overlay.active #mm-confirm-box {
          transform: translateY(0);
        }

        #mm-confirm-title {
          font-size: 18px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 2px;
        }

        #mm-confirm-sub {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          letter-spacing: 1px;
          margin-top: -10px;
        }

        #mm-confirm-btns {
          display: flex;
          gap: 16px;
          margin-top: 4px;
        }

        .mm-confirm-yes {
          padding: 10px 32px;
          background: rgba(180, 50, 50, 0.2);
          border: 1px solid rgba(220, 80, 80, 0.6);
          border-radius: 2px;
          color: rgba(255, 130, 130, 0.9);
          font-family: 'Cairo', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.25s;
        }

        .mm-confirm-yes:hover {
          background: rgba(180, 50, 50, 0.35);
          border-color: rgba(255, 100, 100, 0.8);
          color: #fff;
        }

        .mm-confirm-no {
          padding: 10px 32px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 2px;
          color: rgba(255,255,255,0.55);
          font-family: 'Cairo', sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.25s;
        }

        .mm-confirm-no:hover {
          background: rgba(255,255,255,0.09);
          border-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.85);
        }

        /* ── BOTTOM BAR ── */
        #mm-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          max-width: 900px;
          opacity: 0;
          animation: mm-fade-up 1s ease forwards 1.1s;
        }

        #mm-lore {
          max-width: 340px;
          text-align: right;
        }

        #mm-lore-title {
          font-size: 10px;
          color: #c9a84c;
          letter-spacing: 4px;
          font-weight: 600;
          margin-bottom: 6px;
        }

        #mm-lore-text {
          font-size: 12px;
          color: rgba(255,255,255,0.35);
          line-height: 1.7;
        }

        #mm-version {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 2px;
          text-align: left;
        }

        /* ── AMBIENT PARTICLES ── */
        .mm-particle {
          position: absolute;
          width: 2px;
          height: 2px;
          background: #c9a84c;
          border-radius: 50%;
          z-index: 3;
          animation: mm-particle-float linear infinite;
          opacity: 0;
        }

        @keyframes mm-particle-float {
          0%   { transform: translateY(0) translateX(0);   opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(-180px) translateX(30px); opacity: 0; }
        }

        /* fade out */
        #main-menu.fade-out {
          opacity: 0;
          transition: opacity 0.9s ease;
          pointer-events: none;
        }
      </style>

      <div id="mm-topline"></div>
      <div id="mm-bottomline"></div>
      <div id="mm-bg"></div>
      <div id="mm-vignette"></div>
      <div id="mm-scanlines"></div>

      <div id="mm-layout">

        <!-- Header -->
        <div id="mm-header">
          <div id="mm-eyebrow">
            <div class="mm-line-ornament flip"></div>
            حرب أكتوبر المجيدة
            <div class="mm-line-ornament"></div>
          </div>

          <h1 id="mm-title">معركة <span>المنصورة</span> الجوية</h1>
          <p id="mm-subtitle">١٤ أكتوبر ١٩٧٣</p>

          <div id="mm-divider">
            <div class="mm-div-line"></div>
            <div class="mm-div-diamond sm"></div>
            <div class="mm-div-diamond"></div>
            <div class="mm-div-diamond sm"></div>
            <div class="mm-div-line"></div>
          </div>
        </div>

        <!-- Center -->
        <div id="mm-center">
          <button id="mm-start-btn">
            <div class="mm-btn-icon"></div>
            <span class="mm-btn-text">ابدأ الآن</span>
          </button>

          <div id="mm-secondary-btns">
            <button class="mm-sec-btn">الإعدادات</button>
            <button class="mm-sec-btn">السجلات</button>
            <button class="mm-sec-btn">كيفية اللعب</button>
            <button id="mm-quit-btn">
              <span class="mm-quit-icon"></span>
              اترك اللعب
            </button>
          </div>
        </div>

        <!-- Quit confirm dialog -->
        <div id="mm-confirm-overlay">
          <div id="mm-confirm-box">
            <div id="mm-confirm-title">هل تريد المغادرة؟</div>
            <div id="mm-confirm-sub">سيتم إغلاق اللعبة بالكامل</div>
            <div id="mm-confirm-btns">
              <button class="mm-confirm-yes" id="mm-confirm-yes-btn">نعم، اخرج</button>
              <button class="mm-confirm-no"  id="mm-confirm-no-btn">إلغاء</button>
            </div>
          </div>
        </div>

        <!-- Bottom bar -->
        <div id="mm-bottom">
          <div id="mm-version">v1.0.0 · 2024</div>
          <div id="mm-lore">
            <div id="mm-lore-title">نبذة تاريخية</div>
            <div id="mm-lore-text">
              في سماء المنصورة، خاض الطيارون المصريون أعنف المعارك الجوية
              في تاريخ الشرق الأوسط ضد أحدث الطائرات الإسرائيلية.
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(el);
    this._spawnParticles(el);

    // ✅ REMOVED: auto fade-in from constructor.
    // The menu stays hidden (opacity: 0) until show() is called explicitly.

    // Start button
    const startBtn = el.querySelector('#mm-start-btn') as HTMLButtonElement;
    startBtn.addEventListener('click', () => this._handleStart());

    // Quit button → show confirm dialog
    const quitBtn        = el.querySelector('#mm-quit-btn')         as HTMLButtonElement;
    const confirmOverlay = el.querySelector('#mm-confirm-overlay')  as HTMLElement;
    const confirmYes     = el.querySelector('#mm-confirm-yes-btn')  as HTMLButtonElement;
    const confirmNo      = el.querySelector('#mm-confirm-no-btn')   as HTMLButtonElement;

    quitBtn.addEventListener('click', () => {
      confirmOverlay.classList.add('active');
    });

    confirmNo.addEventListener('click', () => {
      confirmOverlay.classList.remove('active');
    });

    confirmYes.addEventListener('click', () => {
      this.overlay.classList.add('fade-out');
      setTimeout(() => window.close(), 900);
    });

    return el;
  }

  // Ambient floating particles
  private _spawnParticles(container: HTMLElement): void {
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      p.classList.add('mm-particle');
      p.style.left = Math.random() * 100 + '%';
      p.style.bottom = Math.random() * 40 + '%';
      p.style.animationDuration = (6 + Math.random() * 8) + 's';
      p.style.animationDelay = (Math.random() * 8) + 's';
      container.appendChild(p);
    }
  }

  private _handleStart(): void {
    this.overlay.classList.add('fade-out');
    setTimeout(() => {
      this.overlay.remove();
      if (this.onStartCallback) this.onStartCallback();
    }, 900);
  }

  public onStart(callback: () => void): void {
    this.onStartCallback = callback;
  }

  // ✅ UPDATED: show() now triggers the fade-in with double rAF
  // so the browser has time to paint the element before transitioning.
  public show(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.overlay.classList.add('visible');
      });
    });
  }

  public hide(): void {
    this.overlay.classList.add('fade-out');
    setTimeout(() => this.overlay.remove(), 900);
  }
}
