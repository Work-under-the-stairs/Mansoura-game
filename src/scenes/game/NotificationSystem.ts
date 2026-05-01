export type NotifType = 'kill' | 'warn' | 'info' | 'success';

interface NotifOptions {
  type: NotifType;
  title: string;
  msg?: string;
  duration?: number;
  sound?: boolean;
}

/* 🎨 SVG Icons instead of emojis */
const ICONS: Record<NotifType, string> = {
  kill: `
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 7v6c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V7l-9-5z" fill="currentColor"/>
    </svg>
  `,
  warn: `
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 3L2 20h20L12 3z" fill="currentColor"/>
      <rect x="11" y="9" width="2" height="5" fill="#000"/>
      <rect x="11" y="16" width="2" height="2" fill="#000"/>
    </svg>
  `,
  info: `
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="currentColor"/>
      <rect x="11" y="10" width="2" height="6" fill="#000"/>
      <rect x="11" y="6" width="2" height="2" fill="#000"/>
    </svg>
  `,
  success: `
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="currentColor"/>
      <path d="M7 12l3 3 7-7" stroke="#000" stroke-width="2" fill="none"/>
    </svg>
  `,
};

const COLORS: Record<NotifType, string> = {
  kill:    '#E24B4A',
  warn:    '#EF9F27',
  info:    '#378ADD',
  success: '#1D9E75',
};

const TITLE_COLORS: Record<NotifType, string> = {
  kill:    '#F09595',
  warn:    '#FAC775',
  info:    '#85B7EB',
  success: '#5DCAA5',
};

/* 🎵 ONE shared sound */
const SOUND = '/sounds/universfield-new-notification-040-493469.mp3';

export class NotificationSystem {
  private root: HTMLDivElement;
  private counter = 0;
  private readonly MAX = 5;

  constructor() {
    this.root = document.createElement('div');

    Object.assign(this.root.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      pointerEvents: 'none',
      zIndex: '99999',
    });

    this.root.className = 'gn-root';
    document.body.appendChild(this.root);

    this.injectStyles();
  }

  public show(opts: NotifOptions): void {
    const { type, title, msg = '', duration = 4000, sound = true } = opts;

    if (sound) this.playSound();

    if (this.root.children.length >= this.MAX) {
      this.root.removeChild(this.root.firstChild!);
    }

    const id  = `notif-${this.counter++}`;
    const col = COLORS[type];

    const el = document.createElement('div');
    el.className = `gn-notif`;
    el.id = id;

    el.innerHTML = `
      <div class="gn-icon" style="color:${col}">
        ${ICONS[type]}
      </div>
      <div class="gn-body">
        <p class="gn-title" style="color:${TITLE_COLORS[type]}">${title}</p>
        ${msg ? `<p class="gn-msg">${msg}</p>` : ''}
      </div>
      <div class="gn-bar" id="bar-${id}" style="background:${col};width:100%"></div>
    `;

    el.style.borderLeft = `3px solid ${col}`;
    this.root.appendChild(el);

    const bar = document.getElementById(`bar-${id}`)!;
    bar.style.transition = `width ${duration}ms linear`;

    requestAnimationFrame(() => {
      bar.style.width = '0%';
    });

    setTimeout(() => {
      el.classList.add('gn-dying');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  /* 🔊 single sound */
  // private playSound(): void {
  //   try {
  //     const audio = new Audio(SOUND);
  //     audio.volume = 0.6;
  //     audio.play().catch(() => {});
  //   } catch {}
  // }
  private audio = new Audio(SOUND); // ← مرة واحدة بس

  private playSound(): void {
    this.audio.currentTime = 0;
    this.audio.volume = 0.6;
    this.audio.play().catch(() => {});
  }

  public destroy(): void {
    this.root.remove();
    document.getElementById('gn-styles')?.remove();
  }

  private injectStyles(): void {
    if (document.getElementById('gn-styles')) return;

    const style = document.createElement('style');
    style.id = 'gn-styles';

    style.textContent = `
      .gn-root {
        width: min(92vw, 280px);
      }

      .gn-notif {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 12px;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        background: rgba(15,15,25,0.8);
        backdrop-filter: blur(8px);
        position: relative;
        overflow: hidden;
        animation: gn-in 0.2s ease;
        box-shadow: 0 6px 18px rgba(0,0,0,0.25);
        pointer-events: auto;
      }

      .gn-notif.gn-dying {
        opacity: 0;
        transform: translateX(20px);
        transition: 0.25s ease;
      }

      .gn-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }

      .gn-icon svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      .gn-body {
        flex: 1;
      }

      .gn-title {
        font-weight: 600;
        margin: 0;
      }

      .gn-msg {
        margin: 2px 0 0;
        color: #aab2c5;
        font-size: 11px;
      }

      .gn-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
      }

      @keyframes gn-in {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;

    document.head.appendChild(style);
  }
}