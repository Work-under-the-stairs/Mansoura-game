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

        #main-menu.visible { opacity: 1; }

        #mm-bg {
          position: absolute;
          inset: 0;
          background-image: url('/images/main-menu-bg.png');
          background-size: cover;
          background-position: center top;
          z-index: 0;
          animation: mm-slow-zoom 20s ease-in-out infinite alternate;
        }

        @keyframes mm-slow-zoom {
          from { transform: scale(1.04) translateX(0px); }
          to   { transform: scale(1.10) translateX(-18px); }
        }

        #mm-vignette {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to bottom,
              rgba(4,8,16,0.55) 0%,
              rgba(4,8,16,0.15) 35%,
              rgba(4,8,16,0.20) 55%,
              rgba(4,8,16,0.82) 100%
            ),
            radial-gradient(ellipse at center, transparent 40%, rgba(4,8,16,0.5) 100%);
          z-index: 1;
        }

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

        #mm-topline {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, #c9a84c, #f0d080, #c9a84c, transparent);
          z-index: 10;
        }

        #mm-bottomline {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #c9a84c 30%, #c9a84c 70%, transparent);
          z-index: 10;
        }

        /* ── LAYOUT ── */
        #mm-layout {
          position: relative;
          z-index: 5;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: clamp(24px, 5vw, 48px) clamp(16px, 4vw, 32px) clamp(28px, 5vw, 60px);
          box-sizing: border-box;
        }

        /* ── HEADER ── */
        #mm-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(6px, 1.5vw, 10px);
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
          font-size: clamp(9px, 1.8vw, 11px);
          letter-spacing: 6px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .mm-line-ornament {
          width: clamp(28px, 5vw, 48px);
          height: 1px;
          background: linear-gradient(90deg, transparent, #c9a84c);
        }
        .mm-line-ornament.flip { transform: scaleX(-1); }

        #mm-title {
          font-size: clamp(26px, 6vw, 64px);
          font-weight: 900;
          color: #ffffff;
          text-align: center;
          margin: 0;
          letter-spacing: 2px;
          line-height: 1.15;
          text-shadow: 0 0 60px rgba(201,168,76,0.35), 0 2px 4px rgba(0,0,0,0.8);
        }

        #mm-title span { color: #f0d080; }

        #mm-subtitle {
          font-size: clamp(10px, 2vw, 13px);
          color: rgba(255,255,255,0.45);
          letter-spacing: clamp(4px, 1.5vw, 8px);
          font-weight: 400;
          text-align: center;
          margin: 0;
        }

        #mm-divider {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }
        .mm-div-line { width: clamp(40px, 8vw, 80px); height: 1px; background: rgba(201,168,76,0.3); }
        .mm-div-diamond { width: 7px; height: 7px; background: #c9a84c; transform: rotate(45deg); }
        .mm-div-diamond.sm { width: 4px; height: 4px; opacity: 0.5; }

        /* ── CENTER ── */
        #mm-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(18px, 3vw, 32px);
          opacity: 0;
          animation: mm-fade-up 1s ease forwards 0.7s;
        }

        @keyframes mm-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* START BUTTON */
        #mm-start-btn {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 0 clamp(32px, 6vw, 56px);
          height: clamp(50px, 8vw, 68px);
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
          border: 1.5px solid rgba(201,168,76,0.7);
          clip-path: polygon(16px 0%, calc(100% - 16px) 0%, 100% 50%, calc(100% - 16px) 100%, 16px 100%, 0% 50%);
          transition: all 0.3s ease;
        }

        #mm-start-btn::after {
          content: '';
          position: absolute;
          inset: 3px;
          background: linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.05));
          clip-path: polygon(14px 0%, calc(100% - 14px) 0%, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0% 50%);
          transition: all 0.3s ease;
        }

        #mm-start-btn:hover::before { border-color: #f0d080; box-shadow: 0 0 30px rgba(240,208,128,0.3); }
        #mm-start-btn:hover::after  { background: linear-gradient(135deg, rgba(201,168,76,0.35), rgba(201,168,76,0.15)); }
        #mm-start-btn:active        { transform: scale(0.97); }

        .mm-btn-icon {
          position: relative;
          z-index: 1;
          width: 0; height: 0;
          border-style: solid;
          border-width: clamp(5px, 1vw, 7px) 0 clamp(5px, 1vw, 7px) clamp(9px, 1.5vw, 12px);
          border-color: transparent transparent transparent #f0d080;
          transition: transform 0.3s ease;
        }

        #mm-start-btn:hover .mm-btn-icon { transform: translateX(-3px); }

        .mm-btn-text {
          position: relative;
          z-index: 1;
          font-size: clamp(15px, 2.5vw, 20px);
          font-weight: 700;
          color: #f0d080;
          letter-spacing: 3px;
          text-shadow: 0 0 20px rgba(240,208,128,0.5);
          transition: color 0.3s;
        }

        #mm-start-btn:hover .mm-btn-text { color: #fff8dc; }

        /* SECONDARY BUTTONS */
        #mm-secondary-btns {
          display: flex;
          gap: clamp(8px, 2vw, 16px);
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
        }

        .mm-sec-btn {
          padding: clamp(8px, 1.5vw, 10px) clamp(16px, 3vw, 28px);
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 2px;
          color: rgba(255,255,255,0.55);
          font-family: 'Cairo', sans-serif;
          font-size: clamp(11px, 1.8vw, 13px);
          font-weight: 600;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .mm-sec-btn:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.85);
        }

        #mm-quit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: clamp(8px, 1.5vw, 10px) clamp(18px, 3vw, 32px);
          background: rgba(180,50,50,0.12);
          border: 1px solid rgba(180,50,50,0.45);
          border-radius: 2px;
          color: rgb(255,97,97);
          font-family: 'Cairo', sans-serif;
          font-size: clamp(11px, 1.8vw, 13px);
          font-weight: 600;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        #mm-quit-btn:hover {
          background: rgba(180,50,50,0.3);
          border-color: rgba(220,80,80,0.7);
          color: rgba(255,130,130,0.95);
        }

        #mm-quit-btn:active { transform: scale(0.97); }

        .mm-quit-icon {
          width: 10px; height: 10px;
          position: relative; flex-shrink: 0;
        }
        .mm-quit-icon::before, .mm-quit-icon::after {
          content: '';
          position: absolute;
          width: 100%; height: 1.5px;
          background: currentColor;
          top: 50%; left: 0;
        }
        .mm-quit-icon::before { transform: translateY(-50%) rotate(45deg); }
        .mm-quit-icon::after  { transform: translateY(-50%) rotate(-45deg); }

        /* ── BOTTOM BAR ── */
        #mm-bottom {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          width: 100%;
          max-width: 900px;
          opacity: 0;
          animation: mm-fade-up 1s ease forwards 1.1s;
          gap: 16px;
          flex-wrap: wrap;
        }

        #mm-lore { max-width: 340px; text-align: right; }

        #mm-lore-title {
          font-size: clamp(9px, 1.5vw, 10px);
          color: #c9a84c;
          letter-spacing: 4px;
          font-weight: 600;
          margin-bottom: 6px;
        }

        #mm-lore-text {
          font-size: clamp(10px, 1.8vw, 12px);
          color: rgba(255,255,255,0.35);
          line-height: 1.7;
        }

        #mm-version {
          font-size: clamp(9px, 1.5vw, 11px);
          color: rgba(255,255,255,0.2);
          letter-spacing: 2px;
        }

        /* ── QUIT CONFIRM ── */
        #mm-confirm-overlay {
          position: absolute;
          inset: 0;
          z-index: 20;
          background: rgba(4,8,16,0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        #mm-confirm-overlay.active { opacity: 1; pointer-events: all; }

        #mm-confirm-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          padding: clamp(24px, 4vw, 40px) clamp(28px, 5vw, 52px);
          border: 1px solid rgba(201,168,76,0.3);
          border-top: 2px solid rgba(201,168,76,0.6);
          background: rgba(8,14,24,0.92);
          transform: translateY(10px);
          transition: transform 0.3s ease;
          text-align: center;
          max-width: 90vw;
          box-sizing: border-box;
        }

        #mm-confirm-overlay.active #mm-confirm-box { transform: translateY(0); }

        #mm-confirm-title {
          font-size: clamp(14px, 2.5vw, 18px);
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 2px;
        }

        #mm-confirm-sub {
          font-size: clamp(10px, 1.8vw, 12px);
          color: rgba(255,255,255,0.4);
          letter-spacing: 1px;
          margin-top: -10px;
        }

        #mm-confirm-btns { display: flex; gap: 16px; margin-top: 4px; flex-wrap: wrap; justify-content: center; }

        .mm-confirm-yes {
          padding: clamp(8px, 1.5vw, 10px) clamp(20px, 3vw, 32px);
          background: rgba(180,50,50,0.2);
          border: 1px solid rgba(220,80,80,0.6);
          border-radius: 2px;
          color: rgba(255,130,130,0.9);
          font-family: 'Cairo', sans-serif;
          font-size: clamp(11px, 1.8vw, 13px);
          font-weight: 700;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.25s;
        }

        .mm-confirm-yes:hover { background: rgba(180,50,50,0.35); border-color: rgba(255,100,100,0.8); color: #fff; }

        .mm-confirm-no {
          padding: clamp(8px, 1.5vw, 10px) clamp(20px, 3vw, 32px);
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 2px;
          color: rgba(255,255,255,0.55);
          font-family: 'Cairo', sans-serif;
          font-size: clamp(11px, 1.8vw, 13px);
          font-weight: 600;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.25s;
        }

        .mm-confirm-no:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.85); }

        /* ── HOW TO PLAY MODAL ── */
        #mm-howto-overlay {
          position: absolute;
          inset: 0;
          z-index: 25;
          background: rgba(2, 5, 12, 0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.35s ease;
          padding: clamp(12px, 3vw, 24px);
          box-sizing: border-box;
        }

        #mm-howto-overlay.active { opacity: 1; pointer-events: all; }

        #mm-howto-box {
          position: relative;
          width: 100%;
          max-width: 680px;
          max-height: 90vh;
          background: rgba(6, 10, 20, 0.97);
          border: 1px solid rgba(201,168,76,0.25);
          border-top: 2px solid rgba(201,168,76,0.7);
          overflow-y: auto;
          transform: translateY(18px) scale(0.98);
          transition: transform 0.35s ease;
          box-sizing: border-box;
          scrollbar-width: thin;
          scrollbar-color: rgba(201,168,76,0.3) transparent;
        }

        #mm-howto-box::-webkit-scrollbar { width: 4px; }
        #mm-howto-box::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.3); border-radius: 2px; }

        #mm-howto-overlay.active #mm-howto-box { transform: translateY(0) scale(1); }

        /* Corner accents */
        #mm-howto-box::before,
        #mm-howto-box::after {
          content: '';
          position: absolute;
          width: 18px; height: 18px;
          border-color: #c9a84c;
          border-style: solid;
          opacity: 0.6;
        }
        #mm-howto-box::before { top: 0; right: 0; border-width: 0 2px 2px 0; }
        #mm-howto-box::after  { bottom: 0; left: 0; border-width: 2px 0 0 2px; }

        #mm-howto-header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: clamp(16px, 3vw, 24px) clamp(20px, 4vw, 36px) clamp(14px, 2.5vw, 20px);
          background: rgba(6,10,20,0.97);
          border-bottom: 1px solid rgba(201,168,76,0.15);
        }

        #mm-howto-title-wrap {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        #mm-howto-eyebrow {
          font-size: clamp(8px, 1.5vw, 10px);
          color: #c9a84c;
          letter-spacing: 5px;
          font-weight: 600;
          text-transform: uppercase;
        }

        #mm-howto-title {
          font-size: clamp(16px, 3vw, 22px);
          font-weight: 900;
          color: #ffffff;
          letter-spacing: 1px;
          margin: 0;
        }

        #mm-howto-close {
          width: clamp(32px, 5vw, 40px);
          height: clamp(32px, 5vw, 40px);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 2px;
          cursor: pointer;
          color: rgba(255,255,255,0.5);
          font-size: clamp(14px, 2.5vw, 18px);
          transition: all 0.2s;
          flex-shrink: 0;
          font-family: monospace;
        }

        #mm-howto-close:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.3);
          color: #fff;
        }

        #mm-howto-body {
          padding: clamp(20px, 4vw, 36px) clamp(20px, 4vw, 36px) clamp(24px, 4vw, 40px);
          display: flex;
          flex-direction: column;
          gap: clamp(24px, 4vw, 36px);
        }

        /* Section inside modal */
        .mm-ht-section { display: flex; flex-direction: column; gap: 14px; }

        .mm-ht-section-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: clamp(10px, 1.8vw, 12px);
          color: #c9a84c;
          letter-spacing: 4px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .mm-ht-section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(201,168,76,0.2);
        }

        .mm-ht-mission {
          padding: clamp(14px, 2.5vw, 20px) clamp(16px, 3vw, 24px);
          background: rgba(201,168,76,0.06);
          border: 1px solid rgba(201,168,76,0.15);
          border-right: 3px solid rgba(201,168,76,0.6);
          font-size: clamp(12px, 2vw, 14px);
          color: rgba(255,255,255,0.7);
          line-height: 1.8;
        }

        /* Controls grid */
        .mm-ht-controls {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(clamp(140px, 30vw, 190px), 1fr));
          gap: clamp(8px, 1.5vw, 12px);
        }

        .mm-ht-key-row {
          display: flex;
          align-items: center;
          gap: clamp(8px, 1.5vw, 12px);
          padding: clamp(8px, 1.5vw, 11px) clamp(10px, 2vw, 14px);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 2px;
          transition: background 0.2s;
        }

        .mm-ht-key-row:hover { background: rgba(255,255,255,0.06); }

        .mm-ht-key {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: clamp(28px, 5vw, 36px);
          height: clamp(24px, 4vw, 30px);
          padding: 0 clamp(5px, 1vw, 8px);
          background: rgba(201,168,76,0.1);
          border: 1px solid rgba(201,168,76,0.35);
          border-bottom: 2px solid rgba(201,168,76,0.5);
          border-radius: 3px;
          font-size: clamp(9px, 1.5vw, 11px);
          font-weight: 700;
          color: #f0d080;
          letter-spacing: 1px;
          font-family: monospace;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .mm-ht-key-label {
          font-size: clamp(10px, 1.8vw, 12px);
          color: rgba(255,255,255,0.55);
          line-height: 1.4;
        }

        /* Tips */
        .mm-ht-tips { display: flex; flex-direction: column; gap: clamp(8px, 1.5vw, 11px); }

        .mm-ht-tip {
          display: flex;
          align-items: flex-start;
          gap: clamp(10px, 2vw, 14px);
          padding: clamp(10px, 2vw, 14px) clamp(12px, 2.5vw, 18px);
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          font-size: clamp(11px, 1.8vw, 13px);
          color: rgba(255,255,255,0.55);
          line-height: 1.6;
          border-radius: 2px;
        }

        .mm-ht-tip-icon {
          flex-shrink: 0;
          margin-top: 1px;
          width: clamp(16px, 2.5vw, 20px);
          height: clamp(16px, 2.5vw, 20px);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(201,168,76,0.12);
          border: 1px solid rgba(201,168,76,0.25);
          border-radius: 50%;
          font-size: clamp(9px, 1.5vw, 11px);
          color: #c9a84c;
          font-weight: 700;
          font-family: monospace;
        }

        /* Mobile touch section */
        .mm-ht-mobile-note {
          padding: clamp(12px, 2vw, 16px) clamp(14px, 2.5vw, 20px);
          background: rgba(100,150,255,0.06);
          border: 1px solid rgba(100,150,255,0.15);
          border-right: 3px solid rgba(100,150,255,0.4);
          font-size: clamp(11px, 1.8vw, 13px);
          color: rgba(180,200,255,0.65);
          line-height: 1.7;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .mm-ht-mobile-note-icon {
          font-size: clamp(14px, 2.5vw, 18px);
          flex-shrink: 0;
          opacity: 0.7;
        }

        /* Separator */
        .mm-ht-sep {
          height: 1px;
          background: rgba(201,168,76,0.08);
        }

        /* ── PARTICLES ── */
        .mm-particle {
          position: absolute;
          width: 2px; height: 2px;
          background: #c9a84c;
          border-radius: 50%;
          z-index: 3;
          animation: mm-particle-float linear infinite;
          opacity: 0;
        }

        @keyframes mm-particle-float {
          0%   { transform: translateY(0) translateX(0); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(-180px) translateX(30px); opacity: 0; }
        }

        #main-menu.fade-out {
          opacity: 0;
          transition: opacity 0.9s ease;
          pointer-events: none;
        }

        /* ── MOBILE OVERRIDES ── */
        @media (max-width: 480px) {
          #mm-bottom { flex-direction: column-reverse; align-items: center; gap: 10px; }
          #mm-lore   { text-align: center; max-width: 100%; }
          #mm-version { text-align: center; }
          .mm-ht-controls { grid-template-columns: 1fr 1fr; }
        }
      </style>

      <div id="mm-topline"></div>
      <div id="mm-bottomline"></div>
      <div id="mm-bg"></div>
      <div id="mm-vignette"></div>
      <div id="mm-scanlines"></div>

      <div id="mm-layout">

        <div id="mm-header">
          <div id="mm-eyebrow">
            <div class="mm-line-ornament flip"></div>
            حرب أكتوبر المجيدة
            <div class="mm-line-ornament"></div>
          </div>
          <h1 id="mm-title">معارك <span>مصر</span> الجوية</h1>
          <p id="mm-subtitle">١٤ أكتوبر ١٩٧٣</p>
          <div id="mm-divider">
            <div class="mm-div-line"></div>
            <div class="mm-div-diamond sm"></div>
            <div class="mm-div-diamond"></div>
            <div class="mm-div-diamond sm"></div>
            <div class="mm-div-line"></div>
          </div>
        </div>

        <div id="mm-center">
          <button id="mm-start-btn">
            <div class="mm-btn-icon"></div>
            <span class="mm-btn-text">ابدأ الآن</span>
          </button>
          <div id="mm-secondary-btns">
            <button class="mm-sec-btn" id="mm-howto-btn">كيفية اللعب</button>
            <button id="mm-quit-btn">
              <span class="mm-quit-icon"></span>
              اترك اللعب
            </button>
          </div>
        </div>

        <!-- QUIT CONFIRM -->
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

        <!-- HOW TO PLAY MODAL -->
        <div id="mm-howto-overlay">
          <div id="mm-howto-box">

            <div id="mm-howto-header">
              <div id="mm-howto-title-wrap">
                <div id="mm-howto-eyebrow">دليل القتال الجوي</div>
                <h2 id="mm-howto-title">كيفية اللعب</h2>
              </div>
              <button id="mm-howto-close">✕</button>
            </div>

            <div id="mm-howto-body">

              <div class="mm-ht-section">
                <div class="mm-ht-section-title">المهمة</div>
                <div class="mm-ht-mission">
                  أنت طيار مقاتل في سلاح الجو المصري خلال معركة المنصورة الشهيرة ومعركة الصالحية.
                  مهمتك إسقاط الطائرات المعادية والدفاع عن سماء مصر.
                  استخدم رصاصك وصواريخك بذكاء — تجنب النيران وأدِر معركتك باحترافية.
                </div>
              </div>

              <div class="mm-ht-sep"></div>

              <div class="mm-ht-section">
                <div class="mm-ht-section-title">التحكم — كيبورد</div>
                <div class="mm-ht-controls">
                  <div class="mm-ht-key-row">
                    <div class="mm-ht-key">↑</div>
                    <div class="mm-ht-key-label">الطيران للأعلى</div>
                  </div>
                  <div class="mm-ht-key-row">
                    <div class="mm-ht-key">↓</div>
                    <div class="mm-ht-key-label">الطيران للأسفل</div>
                  </div>
                  <div class="mm-ht-key-row">
                    <div class="mm-ht-key">←</div>
                    <div class="mm-ht-key-label">الانعطاف يساراً</div>
                  </div>
                  <div class="mm-ht-key-row">
                    <div class="mm-ht-key">→</div>
                    <div class="mm-ht-key-label">الانعطاف يميناً</div>
                  </div>
                  <div class="mm-ht-key-row">
                    <div class="mm-ht-key">Z</div>
                    <div class="mm-ht-key-label">إطلاق رصاص</div>
                  </div>
                  <div class="mm-ht-key-row">
                    <div class="mm-ht-key">X</div>
                    <div class="mm-ht-key-label">إطلاق صاروخ</div>
                  </div>
                  <div class="mm-ht-key-row">
                    <div class="mm-ht-key">SHIFT</div>
                    <div class="mm-ht-key-label">تسريع الطائرة</div>
                  </div>
                </div>
              </div>

              <div class="mm-ht-sep"></div>

              <div class="mm-ht-section">
                <div class="mm-ht-section-title">تحكم اللمس — موبايل</div>
                <div class="mm-ht-mobile-note">
                  <div class="mm-ht-mobile-note-icon">📱</div>
                  <div>
                    استخدم الجويستيك على اليسار للتوجيه، وأزرار الإطلاق على اليمين.
                    اضغط مطولاً على زر السرعة للتسارع.
                  </div>
                </div>
              </div>

              <div class="mm-ht-sep"></div>

              <div class="mm-ht-section">
                <div class="mm-ht-section-title">نصائح قتالية</div>
                <div class="mm-ht-tips">
                  <div class="mm-ht-tip">
                    <div class="mm-ht-tip-icon">!</div>
                    <div>راقب مؤشر سلامة الطائرة في أعلى الشاشة — إذا انخفض للأحمر ابتعد عن الاشتباك فوراً.</div>
                  </div>
                  <div class="mm-ht-tip">
                    <div class="mm-ht-tip-icon">!</div>
                    <div>الرصاص أسرع وأدق على المسافات القصيرة، والصواريخ فعّالة على الأعداء البعيدين.</div>
                  </div>
                  <div class="mm-ht-tip">
                    <div class="mm-ht-tip-icon">!</div>
                    <div>الأعداء يطلقون النيران من مسافات بعيدة — المناورة والحركة المستمرة تقلل الإصابات.</div>
                  </div>
                  <div class="mm-ht-tip">
                    <div class="mm-ht-tip-icon">!</div>
                    <div>استخدم زر التسريع للاقتراب السريع ثم عد لسرعتك العادية لزيادة الدقة عند الإطلاق.</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <div id="mm-bottom">
          <div id="mm-version">v1.0.0 · 2026</div>
          <div id="mm-lore">
            <div id="mm-lore-title">نبذة تاريخية</div>
            <div id="mm-lore-text">
              في سماء المنصورة، خاض الطيارون المصريون أعنف المعارك الجوية
              في العالم ضد أحدث الطائرات الإسرائيلية.
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(el);
    this._spawnParticles(el);

    // ── Start button ──
    const startBtn = el.querySelector('#mm-start-btn') as HTMLButtonElement;
    startBtn.addEventListener('click', () => this._handleStart());

    // ── Quit button ──
    const quitBtn        = el.querySelector('#mm-quit-btn')        as HTMLButtonElement;
    const confirmOverlay = el.querySelector('#mm-confirm-overlay') as HTMLElement;
    const confirmYes     = el.querySelector('#mm-confirm-yes-btn') as HTMLButtonElement;
    const confirmNo      = el.querySelector('#mm-confirm-no-btn')  as HTMLButtonElement;

    quitBtn.addEventListener('click', () => confirmOverlay.classList.add('active'));
    confirmNo.addEventListener('click', () => confirmOverlay.classList.remove('active'));
    confirmYes.addEventListener('click', () => {
      this.overlay.classList.add('fade-out');
      setTimeout(() => window.close(), 900);
    });

    // ── How to Play button ──
    const howtoBtn     = el.querySelector('#mm-howto-btn')     as HTMLButtonElement;
    const howtoOverlay = el.querySelector('#mm-howto-overlay') as HTMLElement;
    const howtoClose   = el.querySelector('#mm-howto-close')   as HTMLButtonElement;

    howtoBtn.addEventListener('click', () => howtoOverlay.classList.add('active'));
    howtoClose.addEventListener('click', () => howtoOverlay.classList.remove('active'));

    // Close on backdrop click
    howtoOverlay.addEventListener('click', (e) => {
      if (e.target === howtoOverlay) howtoOverlay.classList.remove('active');
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        howtoOverlay.classList.remove('active');
        confirmOverlay.classList.remove('active');
      }
    });

    return el;
  }

  private _spawnParticles(container: HTMLElement): void {
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      p.classList.add('mm-particle');
      p.style.left             = Math.random() * 100 + '%';
      p.style.bottom           = Math.random() * 40  + '%';
      p.style.animationDuration = (6 + Math.random() * 8) + 's';
      p.style.animationDelay   = (Math.random() * 8) + 's';
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