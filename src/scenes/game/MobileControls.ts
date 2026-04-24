import { Controls } from './Controls';

export class MobileControls {
  private container: HTMLElement;
  private controls: Controls;
  private isMobile: boolean;

  // Joystick state
  private joystickBase: HTMLElement | null = null;
  private joystickThumb: HTMLElement | null = null;
  private joystickActive = false;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;

  // Deadzone and max radius
  private readonly MAX_RADIUS = 40;
  private readonly DEADZONE = 8;

  constructor(container: HTMLElement, controls: Controls) {
    this.container = container;
    this.controls = controls;
    this.isMobile = this.detectMobile();

    if (this.isMobile) {
      this.injectStyles();
      this.createOrientationOverlay();
      this.createControls();
      this.lockLandscape();
    }
  }

  private detectMobile(): boolean {
    return true // just to test mobile controls on desktop, remove this line for real detection
    return (
      /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) ||
      navigator.maxTouchPoints > 1 ||
      window.innerWidth < 1024
    );
  }

  private lockLandscape(): void {
    // Try the Screen Orientation API first
    try {
      (screen.orientation as any).lock?.('landscape').catch(() => {});
    } catch (_) {}
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #mobile-orientation-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: #000;
        z-index: 9999;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 16px;
      }
      #mobile-orientation-overlay.visible { display: flex; }
      #mobile-orientation-overlay svg { animation: rotate-hint 1.5s ease-in-out infinite alternate; }
      @keyframes rotate-hint {
        from { transform: rotate(0deg); }
        to   { transform: rotate(-90deg); }
      }
      #mobile-orientation-overlay p {
        color: #fff;
        font-family: sans-serif;
        font-size: 16px;
        margin: 0;
        opacity: 0.8;
      }

      /* Keep game canvas landscape via CSS rotate when API fails */
      @media (orientation: portrait) and (max-width: 1024px) {
        #game-world-root {
          transform-origin: top left;
          transform: rotate(90deg) translateY(-100%);
          width: 100vh !important;
          height: 100vw !important;
          top: 0 !important;
          left: 0 !important;
        }
      }

      /* Controls overlay */
      #mobile-controls {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 100;
        touch-action: none;
      }

      /* Left cluster: Boost + Shoot */
      #mobile-left-buttons {
        position: absolute;
        bottom: 24px;
        left: 24px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: all;
      }

      .mobile-action-btn {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 2.5px solid rgba(255,255,255,0.5);
        background: rgba(0,0,0,0.35);
        backdrop-filter: blur(4px);
        color: #fff;
        font-family: sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 3px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        transition: background 0.1s, transform 0.1s;
      }
      .mobile-action-btn:active,
      .mobile-action-btn.pressed {
        background: rgba(255,255,255,0.25);
        transform: scale(0.93);
      }
      .mobile-action-btn svg { display: block; }

      /* Right cluster: Joystick */
      #mobile-joystick-area {
        position: absolute;
        bottom: 24px;
        right: 24px;
        width: 120px;
        height: 120px;
        pointer-events: all;
      }
      #joystick-base {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 2.5px solid rgba(255,255,255,0.35);
        background: rgba(0,0,0,0.3);
        backdrop-filter: blur(4px);
      }
      #joystick-thumb {
        position: absolute;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(255,255,255,0.7);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        transition: transform 0.05s;
        pointer-events: none;
      }
      /* Arrow hints on joystick base */
      #joystick-arrows {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  private createOrientationOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'mobile-orientation-overlay';
    overlay.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="8" width="28" height="36" rx="4" stroke="white" stroke-width="2.5"/>
        <rect x="14" y="4" width="36" height="28" rx="4" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
      </svg>
      <p>Rotate device to play</p>
    `;
    document.body.appendChild(overlay);

    const checkOrientation = () => {
      const isPortrait =
        window.innerHeight > window.innerWidth ||
        (screen.orientation?.type ?? '').includes('portrait');
      overlay.classList.toggle('visible', isPortrait);
    };

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation();
  }

  private createControls(): void {
    const wrapper = document.createElement('div');
    wrapper.id = 'mobile-controls';

    // --- LEFT: Action buttons ---
    const leftButtons = document.createElement('div');
    leftButtons.id = 'mobile-left-buttons';

    const boostBtn = this.makeActionButton(
      'BOOST',
      // Thunderbolt icon
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"
          fill="rgba(255,220,60,0.9)" stroke="rgba(255,220,60,0.5)" stroke-width="1"/>
      </svg>`,
      // pointer down → ShiftLeft held
      () => this.controls.keys['ShiftLeft'] = true,
      () => this.controls.keys['ShiftLeft'] = false,
    );

    const shootBtn = this.makeActionButton(
      'FIRE',
      // Crosshair icon
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="7" stroke="rgba(255,100,100,0.9)" stroke-width="2"/>
        <circle cx="12" cy="12" r="2" fill="rgba(255,100,100,0.9)"/>
        <line x1="12" y1="2" x2="12" y2="6"  stroke="rgba(255,100,100,0.7)" stroke-width="2"/>
        <line x1="12" y1="18" x2="12" y2="22" stroke="rgba(255,100,100,0.7)" stroke-width="2"/>
        <line x1="2" y1="12" x2="6" y2="12"   stroke="rgba(255,100,100,0.7)" stroke-width="2"/>
        <line x1="18" y1="12" x2="22" y2="12" stroke="rgba(255,100,100,0.7)" stroke-width="2"/>
      </svg>`,
      () => this.controls.keys['Space'] = true,
      () => this.controls.keys['Space'] = false,
    );

    leftButtons.appendChild(shootBtn);
    leftButtons.appendChild(boostBtn);

    // --- RIGHT: Joystick ---
    const joystickArea = document.createElement('div');
    joystickArea.id = 'mobile-joystick-area';

    const base = document.createElement('div');
    base.id = 'joystick-base';
    this.joystickBase = base;

    // Arrow hints (faint directional cues)
    base.innerHTML = `
      <svg id="joystick-arrows" viewBox="0 0 120 120">
        <path d="M60 14 L52 26 L68 26 Z" fill="rgba(255,255,255,0.2)"/>
        <path d="M60 106 L52 94 L68 94 Z" fill="rgba(255,255,255,0.2)"/>
        <path d="M14 60 L26 52 L26 68 Z" fill="rgba(255,255,255,0.2)"/>
        <path d="M106 60 L94 52 L94 68 Z" fill="rgba(255,255,255,0.2)"/>
      </svg>
    `;

    const thumb = document.createElement('div');
    thumb.id = 'joystick-thumb';
    this.joystickThumb = thumb;

    joystickArea.appendChild(base);
    joystickArea.appendChild(thumb);

    wrapper.appendChild(leftButtons);
    wrapper.appendChild(joystickArea);
    this.container.appendChild(wrapper);

    this.bindJoystick(joystickArea);
  }

  private makeActionButton(
    label: string,
    iconSvg: string,
    onPress: () => void,
    onRelease: () => void,
  ): HTMLElement {
    const btn = document.createElement('div');
    btn.className = 'mobile-action-btn';
    btn.innerHTML = `${iconSvg}<span>${label}</span>`;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      onPress();
    });
    const up = () => {
      btn.classList.remove('pressed');
      onRelease();
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);

    return btn;
  }

  private bindJoystick(area: HTMLElement): void {
    area.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.joystickActive = true;
      this.joystickPointerId = e.pointerId;
      area.setPointerCapture(e.pointerId);
      const rect = area.getBoundingClientRect();
      this.joystickOrigin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      this.updateJoystick(e.clientX, e.clientY);
    });

    area.addEventListener('pointermove', (e) => {
      if (!this.joystickActive || e.pointerId !== this.joystickPointerId) return;
      e.preventDefault();
      this.updateJoystick(e.clientX, e.clientY);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickActive = false;
      this.joystickPointerId = null;
      this.resetJoystick();
    };

    area.addEventListener('pointerup', release);
    area.addEventListener('pointercancel', release);
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickOrigin.x;
    const dy = clientY - this.joystickOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, this.MAX_RADIUS);

    const nx = dist > 0 ? (dx / dist) * clamped : 0;
    const ny = dist > 0 ? (dy / dist) * clamped : 0;

    // Move thumb visually (relative to joystick centre at 50%/50%)
    if (this.joystickThumb) {
      this.joystickThumb.style.transform =
        `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    }

    // Map to key presses with deadzone
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);

    this.controls.keys['ArrowLeft']  = ax > this.DEADZONE && dx < 0;
    this.controls.keys['ArrowRight'] = ax > this.DEADZONE && dx > 0;
    this.controls.keys['ArrowUp']    = ay > this.DEADZONE && dy < 0;
    this.controls.keys['ArrowDown']  = ay > this.DEADZONE && dy > 0;
  }

  private resetJoystick(): void {
    if (this.joystickThumb) {
      this.joystickThumb.style.transform = 'translate(-50%, -50%)';
    }
    this.controls.keys['ArrowLeft']  = false;
    this.controls.keys['ArrowRight'] = false;
    this.controls.keys['ArrowUp']    = false;
    this.controls.keys['ArrowDown']  = false;
  }

  public destroy(): void {
    document.getElementById('mobile-controls')?.remove();
    document.getElementById('mobile-orientation-overlay')?.remove();
  }
}