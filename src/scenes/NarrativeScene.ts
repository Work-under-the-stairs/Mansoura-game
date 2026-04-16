export class NarrativeScene {
  private container: HTMLElement;
  private overlay: HTMLElement;
  private onCompleteCallback: (() => void) | null = null;

  private readonly text =
    'نجحت قواتنا المسلحة في عبور قناة السويس، وحطمت خط بارليف، ذلك الخط الذي قيل عنه إنه لا يُقهر. لقد عبرنا القناة، واقتحمنا المانع المائي، وتقدمنا داخل أرض سيناء الحبيبة.\n\nإن ما تحقق هو نتيجة إيمان عميق، وعمل دؤوب، وتخطيط دقيق، وصبر طويل.\n\nلقد أثبتت قواتنا المسلحة أنها على مستوى المسؤولية، وأن الجندي المصري قادر على صنع المعجزات.\n\nإن هذا النصر ليس مجرد انتصار عسكري، بل هو انتصار للإرادة العربية، وانتصار للحق على الباطل.\n\nوأقول لأبناء مصر: لقد استرددنا كرامتنا، واستعدنا ثقتنا بأنفسنا.\n\nإن الطريق ما زال طويلاً، ولكننا بدأنا بداية قوية، وسنواصل الكفاح حتى تتحرر كل أرضنا.\n\nتحية لقواتنا المسلحة، وتحية لشعب مصر العظيم، الذي صمد وتحمل وساند.\n\nوالله معنا، وهو نعم المولى ونعم النصير.';

  constructor(container: HTMLElement) {
    this.container = container;
    this.overlay = this.createOverlay();
  }

  private createOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'narrative-screen';
    el.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;900&display=swap');

        #narrative-screen {
          position: fixed;
          inset: 0;
          z-index: 9500;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: 'Cairo', sans-serif;
          direction: rtl;
          overflow: hidden;
          opacity: 0;
          transition: opacity 1s ease;
        }

        #narrative-screen.visible {
          opacity: 1;
        }

        /* ── BACKGROUND ── */
        #ns-bg {
          position: absolute;
          inset: 0;
          background-image: url('/images/main-menu-bg.png');
          background-size: cover;
          background-position: center;
          filter: brightness(0.25) saturate(0.6);
          z-index: 0;
        }

        #ns-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.75) 100%);
          z-index: 1;
        }

        /* ── TOP / BOTTOM GOLDEN LINES ── */
        #ns-topline {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, #c9a84c, #f0d080, #c9a84c, transparent);
          z-index: 10;
        }

        #ns-bottomline {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #c9a84c 30%, #c9a84c 70%, transparent);
          z-index: 10;
        }

        /* ── HEADER LABEL ── */
        #ns-header {
          position: relative;
          z-index: 5;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          margin-bottom: 32px;
          opacity: 0;
          transform: translateY(-16px);
          transition: opacity 0.8s ease, transform 0.8s ease;
        }

        #ns-header.visible {
          opacity: 1;
          transform: translateY(0);
        }

        #ns-eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #c9a84c;
          font-size: 11px;
          letter-spacing: 6px;
          font-weight: 600;
        }

        .ns-orn-line {
          width: 40px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #c9a84c);
        }
        .ns-orn-line.flip { transform: scaleX(-1); }

        #ns-eyebrow-diamond {
          width: 6px;
          height: 6px;
          background: #c9a84c;
          transform: rotate(45deg);
        }

        /* ── PAPYRUS ── */
        #ns-papyrus-wrap {
          position: relative;
          z-index: 5;
          width: min(680px, 90vw);
          transform: translateY(60px) scale(0.94);
          opacity: 0;
          transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.9s ease;
        }

        #ns-papyrus-wrap.visible {
          transform: translateY(0) scale(1);
          opacity: 1;
        }

        /* Papyrus curl top */
        #ns-curl-top {
          width: 100%;
          height: 28px;
          background: linear-gradient(180deg,
            #c8a96e 0%,
            #d4b87a 30%,
            #e2c98a 60%,
            #dbbf7f 100%
          );
          border-radius: 6px 6px 0 0;
          position: relative;
          box-shadow: inset 0 -4px 8px rgba(0,0,0,0.15), 0 -3px 10px rgba(0,0,0,0.35);
        }

        #ns-curl-top::before {
          content: '';
          position: absolute;
          top: 4px;
          left: 12%;
          right: 12%;
          height: 3px;
          background: rgba(0,0,0,0.08);
          border-radius: 2px;
        }

        #ns-curl-top::after {
          content: '';
          position: absolute;
          top: 10px;
          left: 20%;
          right: 20%;
          height: 2px;
          background: rgba(0,0,0,0.05);
          border-radius: 1px;
        }

        /* Papyrus body */
        #ns-papyrus-body {
          background: linear-gradient(
            160deg,
            #f2e4c4 0%,
            #ecdaa8 20%,
            #e8d49e 50%,
            #ecdcaa 80%,
            #f0e2bc 100%
          );
          padding: 40px 52px 44px;
          position: relative;
          overflow: hidden;
          box-shadow:
            inset 2px 0 6px rgba(0,0,0,0.06),
            inset -2px 0 6px rgba(0,0,0,0.06),
            0 6px 40px rgba(0,0,0,0.5);
        }

        /* Papyrus fibres texture */
        #ns-papyrus-body::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 18px,
              rgba(139,105,40,0.05) 18px,
              rgba(139,105,40,0.05) 19px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 28px,
              rgba(139,105,40,0.03) 28px,
              rgba(139,105,40,0.03) 29px
            );
          pointer-events: none;
        }

        /* Edge darkening */
        #ns-papyrus-body::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to right, rgba(139,105,40,0.12) 0%, transparent 10%, transparent 90%, rgba(139,105,40,0.12) 100%),
            linear-gradient(to bottom, rgba(139,105,40,0.08) 0%, transparent 8%, transparent 92%, rgba(139,105,40,0.08) 100%);
          pointer-events: none;
        }

        /* Papyrus curl bottom */
        #ns-curl-bottom {
          width: 100%;
          height: 28px;
          background: linear-gradient(0deg,
            #c8a96e 0%,
            #d4b87a 30%,
            #e2c98a 60%,
            #dbbf7f 100%
          );
          border-radius: 0 0 6px 6px;
          position: relative;
          box-shadow: inset 0 4px 8px rgba(0,0,0,0.15), 0 6px 14px rgba(0,0,0,0.4);
        }

        #ns-curl-bottom::before {
          content: '';
          position: absolute;
          bottom: 4px;
          left: 12%;
          right: 12%;
          height: 3px;
          background: rgba(0,0,0,0.08);
          border-radius: 2px;
        }

        #ns-curl-bottom::after {
          content: '';
          position: absolute;
          bottom: 10px;
          left: 20%;
          right: 20%;
          height: 2px;
          background: rgba(0,0,0,0.05);
          border-radius: 1px;
        }

        /* ── TEXT INSIDE PAPYRUS ── */
        #ns-text-content {
          position: relative;
          z-index: 2;
          font-family: 'Amiri', serif;
          font-size: clamp(15px, 2.2vw, 18px);
          line-height: 2;
          color: #3a2800;
          text-align: justify;
          min-height: 120px;
          white-space: pre-wrap;
          word-spacing: 2px;
        }

        /* blinking cursor */
        #ns-cursor {
          display: inline-block;
          width: 2px;
          height: 1.1em;
          background: #7a5010;
          vertical-align: middle;
          margin-right: 2px;
          animation: ns-blink 0.8s step-end infinite;
        }

        @keyframes ns-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }

        #ns-cursor.hidden {
          display: none;
        }

        /* ── ORNAMENT DIVIDER ── */
        #ns-divider {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 12px 0 16px;
        }

        .ns-div-line {
          flex: 1;
          height: 1px;
          background: rgba(90, 60, 10, 0.2);
        }

        .ns-div-diamond {
          width: 6px;
          height: 6px;
          background: rgba(90, 60, 10, 0.35);
          transform: rotate(45deg);
        }

        .ns-div-diamond.sm {
          width: 4px;
          height: 4px;
          opacity: 0.5;
        }

        /* ── FOOTER ACTIONS ── */
        #ns-footer {
          position: relative;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 20px;
          margin-top: 28px;
          opacity: 0;
          transition: opacity 0.6s ease;
        }

        #ns-footer.visible {
          opacity: 1;
        }

        .ns-action-btn {
          padding: 10px 36px;
          background: transparent;
          border: 1.5px solid rgba(201, 168, 76, 0.6);
          color: #f0d080;
          font-family: 'Cairo', sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 3px;
          cursor: pointer;
          transition: all 0.3s ease;
          clip-path: polygon(12px 0%, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0% 50%);
        }

        .ns-action-btn:hover {
          background: rgba(201, 168, 76, 0.15);
          border-color: #f0d080;
        }

        .ns-action-btn:active {
          transform: scale(0.97);
        }

        .ns-skip-btn {
          padding: 8px 20px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          color: rgba(255,255,255,0.35);
          font-family: 'Cairo', sans-serif;
          font-size: 12px;
          letter-spacing: 2px;
          cursor: pointer;
          border-radius: 2px;
          transition: all 0.3s ease;
        }

        .ns-skip-btn:hover {
          border-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.6);
        }

        /* ── SEAL ── */
        #ns-seal {
          position: absolute;
          bottom: -18px;
          left: 50%;
          transform: translateX(-50%);
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #b8860b, #d4a017, #f0c040, #d4a017);
          border: 2px solid #8b6914;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
          font-size: 22px;
          z-index: 6;
        }

        /* fade out */
        #narrative-screen.fade-out {
          opacity: 0;
          transition: opacity 0.9s ease;
          pointer-events: none;
        }
      </style>

      <div id="ns-bg"></div>
      <div id="ns-vignette"></div>
      <div id="ns-topline"></div>
      <div id="ns-bottomline"></div>

      <!-- Header -->
      <div id="ns-header">
        <div id="ns-eyebrow">
          <div class="ns-orn-line flip"></div>
          <div id="ns-eyebrow-diamond"></div>
          خطاب القائد العام
          <div id="ns-eyebrow-diamond"></div>
          <div class="ns-orn-line"></div>
        </div>
      </div>

      <!-- Papyrus -->
      <div id="ns-papyrus-wrap">
        <div id="ns-curl-top"></div>
        <div id="ns-papyrus-body">
          <div id="ns-divider">
            <div class="ns-div-line"></div>
            <div class="ns-div-diamond sm"></div>
            <div class="ns-div-diamond"></div>
            <div class="ns-div-diamond sm"></div>
            <div class="ns-div-line"></div>
          </div>
          <div id="ns-text-content"><span id="ns-cursor"></span></div>
          <div id="ns-divider" style="margin-top:16px;">
            <div class="ns-div-line"></div>
            <div class="ns-div-diamond sm"></div>
            <div class="ns-div-diamond"></div>
            <div class="ns-div-diamond sm"></div>
            <div class="ns-div-line"></div>
          </div>
        </div>
        <div id="ns-curl-bottom"></div>
        <div id="ns-seal">🦅</div>
      </div>

      <!-- Footer -->
      <div id="ns-footer">
        <button class="ns-skip-btn" id="ns-skip-btn">تخطي</button>
        <button class="ns-action-btn" id="ns-continue-btn" style="display:none;">ابدأ المهمة</button>
      </div>
    `;

    document.body.appendChild(el);
    this._bindEvents(el);
    return el;
  }

  private _bindEvents(el: HTMLElement): void {
    const skipBtn     = el.querySelector('#ns-skip-btn')     as HTMLButtonElement;
    const continueBtn = el.querySelector('#ns-continue-btn') as HTMLButtonElement;

    skipBtn.addEventListener('click', () => this._finishTyping());
    continueBtn.addEventListener('click', () => this._exit());
  }

  // ── PUBLIC: show the scene ──────────────────────────────────────────────────
  public show(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.overlay.classList.add('visible');
        const header  = this.overlay.querySelector('#ns-header')       as HTMLElement;
        const papyrus = this.overlay.querySelector('#ns-papyrus-wrap') as HTMLElement;

        // stagger: header first, papyrus 200ms later
        setTimeout(() => header.classList.add('visible'), 300);
        setTimeout(() => {
          papyrus.classList.add('visible');
          setTimeout(() => this._startTyping(), 600);
        }, 500);
      });
    });
  }

  // ── TYPEWRITER ──────────────────────────────────────────────────────────────
  private _typingInterval: ReturnType<typeof setInterval> | null = null;
  private _charIndex = 0;
  private _typingDone = false;

  private _startTyping(): void {
    const textEl  = this.overlay.querySelector('#ns-text-content') as HTMLElement;
    const cursor  = this.overlay.querySelector('#ns-cursor')       as HTMLElement;
    const words   = this.text.split('');

    this._typingInterval = setInterval(() => {
      if (this._charIndex >= words.length) {
        this._onTypingComplete();
        return;
      }

      // insert char before cursor
      const char = words[this._charIndex];
      cursor.insertAdjacentText('beforebegin', char);
      this._charIndex++;

      // auto-scroll papyrus body
      const body = this.overlay.querySelector('#ns-papyrus-body') as HTMLElement;
      body.scrollTop = body.scrollHeight;
    }, 38); // ~38ms per character feels like natural reading pace
  }

  private _finishTyping(): void {
    if (this._typingDone) return;
    if (this._typingInterval) {
      clearInterval(this._typingInterval);
      this._typingInterval = null;
    }
    const textEl = this.overlay.querySelector('#ns-text-content') as HTMLElement;
    const cursor = this.overlay.querySelector('#ns-cursor')       as HTMLElement;
    cursor.insertAdjacentText('beforebegin', this.text.slice(this._charIndex));
    this._charIndex = this.text.length;
    this._onTypingComplete();
  }

  private _onTypingComplete(): void {
    if (this._typingInterval) {
      clearInterval(this._typingInterval);
      this._typingInterval = null;
    }
    this._typingDone = true;

    const cursor      = this.overlay.querySelector('#ns-cursor')       as HTMLElement;
    const footer      = this.overlay.querySelector('#ns-footer')       as HTMLElement;
    const continueBtn = this.overlay.querySelector('#ns-continue-btn') as HTMLElement;
    const skipBtn     = this.overlay.querySelector('#ns-skip-btn')     as HTMLElement;

    cursor.classList.add('hidden');
    skipBtn.style.display = 'none';
    continueBtn.style.display = 'block';

    setTimeout(() => footer.classList.add('visible'), 100);
  }

  // ── EXIT ───────────────────────────────────────────────────────────────────
  private _exit(): void {
    this.overlay.classList.add('fade-out');
    setTimeout(() => {
      this.overlay.remove();
      if (this.onCompleteCallback) this.onCompleteCallback();
    }, 900);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────
  public onComplete(callback: () => void): void {
    this.onCompleteCallback = callback;
  }

  public hide(): void {
    this._exit();
  }
}
