import { Controls } from './Controls';

export class MobileControls {
  private controls: Controls;
  private joystickBase: HTMLElement | null = null;
  private joystickThumb: HTMLElement | null = null;
  private joystickActive = false;
  private joystickOrigin = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;

  private readonly MAX_RADIUS = 40;
  private readonly DEADZONE = 8;

  constructor(container: HTMLElement, controls: Controls) {
    this.controls = controls;

    if (this.detectMobile()) {
      this.injectStyles();
      this.createControls(container);
    }
  }

  private detectMobile(): boolean {
    // return true
    return (
      /Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) ||
      navigator.maxTouchPoints > 1 ||
      window.innerWidth < 1024
    );
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #mobile-controls {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 100;
        touch-action: none;
      }

      #mobile-left-cluster {
        position: absolute;
        bottom: 16px;
        left: 20px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        pointer-events: all;
      }

      #mobile-weapon-row {
        display: flex;
        flex-direction: row;
        gap: 10px;
        align-items: center;
      }

      .action-btn-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }

      .action-btn {
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.25);
        border: 2.5px solid var(--btn-color, rgba(255,255,255,0.4));
        box-shadow:
          0 0 10px 2px var(--btn-glow, rgba(255,255,255,0.2)),
          inset 0 0 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.08s, background 0.08s;
      }

      .action-btn img {
        width: 38px;
        height: 38px;
        object-fit: contain;
        pointer-events: none;
        opacity: 0.9;
      }

      .action-btn:active,
      .action-btn.pressed {
        transform: scale(0.91);
        background: rgba(255, 255, 255, 0.12);
        box-shadow:
          0 0 18px 5px var(--btn-glow, rgba(255,255,255,0.35)),
          inset 0 0 8px rgba(0,0,0,0.2);
      }

      .action-btn-label {
        font-family: sans-serif;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        pointer-events: none;
        color: var(--btn-color);
        text-shadow: 0 0 6px var(--btn-glow);
      }

      .btn-machinegun { --btn-color: rgba(255,210,0,0.75); --btn-glow: rgba(255,210,0,0.3); }
      .btn-missiles   { --btn-color: rgba(0,210,255,0.75); --btn-glow: rgba(0,210,255,0.3); }
      .btn-boost      { --btn-color: rgba(255,120,0,0.75);  --btn-glow: rgba(255,120,0,0.3);  }

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
        border: 2.5px solid rgba(255,255,255,0.3);
        background: rgba(0,0,0,0.25);
      }
      #joystick-thumb {
        position: absolute;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(255,255,255,0.6);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  private createControls(container: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.id = 'mobile-controls';

    // ── LEFT CLUSTER ──
    const leftCluster = document.createElement('div');
    leftCluster.id = 'mobile-left-cluster';

    // Boost on top
    leftCluster.appendChild(this.makeButton('btn-boost', 'BOOST',
      'public/images/boost.png',
      () => this.controls.keys['ShiftLeft'] = true,
      () => this.controls.keys['ShiftLeft'] = false,
    ));

    // Machine Gun + Missiles side by side below
    const weaponRow = document.createElement('div');
    weaponRow.id = 'mobile-weapon-row';
    weaponRow.appendChild(this.makeButton('btn-machinegun', 'MACHINE GUN',
      'public/images/bullet3.png',
      () => this.controls.keys['KeyZ'] = true,
      () => this.controls.keys['KeyZ'] = false,
    ));
    weaponRow.appendChild(this.makeButton('btn-missiles', 'MISSILES',
      'public/images/missile.png',
      () => this.controls.keys['KeyX'] = true,
      () => this.controls.keys['KeyX'] = false,
    ));
    leftCluster.appendChild(weaponRow);

    // ── JOYSTICK ──
    const joystickArea = document.createElement('div');
    joystickArea.id = 'mobile-joystick-area';

    const base = document.createElement('div');
    base.id = 'joystick-base';
    this.joystickBase = base;
    base.innerHTML = `
      <svg viewBox="0 0 120 120" style="position:absolute;inset:0;pointer-events:none">
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

    wrapper.appendChild(leftCluster);
    wrapper.appendChild(joystickArea);
    container.appendChild(wrapper);

    this.bindJoystick(joystickArea);
  }

  private makeButton(
    colorClass: string,
    label: string,
    iconPath: string,
    onPress: () => void,
    onRelease: () => void,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'action-btn-wrap';

    const btn = document.createElement('div');
    btn.className = `action-btn ${colorClass}`;

    const img = document.createElement('img');
    img.src = iconPath;
    img.alt = label;
    btn.appendChild(img);

    const lbl = document.createElement('span');
    lbl.className = `action-btn-label ${colorClass}`;
    lbl.textContent = label;

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

    wrap.appendChild(btn);
    wrap.appendChild(lbl);
    return wrap;
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

    if (this.joystickThumb) {
      this.joystickThumb.style.transform =
        `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    }

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
  }
}