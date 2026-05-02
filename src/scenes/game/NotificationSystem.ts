export type NotifType = 'kill' | 'warn' | 'info' | 'success';

interface NotifOptions {
  type: NotifType;
  title: string;
  msg?: string;
  duration?: number;
  sound?: boolean;
}

const COLORS: Record<NotifType, string> = {
  kill: '#901414',
  warn: '#C9A84C',
  info: '#556B2F',
  success: '#7C9A42',
};

/* SVG Icons */
const ICONS: Record<NotifType, string> = {
  kill: '✦',
  warn: '⚠',
  info: '✈',
  success: '✔',
};

const SOUND = '/sounds/universfield-new-notification-040-493469.mp3';

export class NotificationSystem {
  private root: HTMLDivElement;
  private counter = 0;
  private readonly MAX = 5;
  private audio = new Audio(SOUND);

  constructor() {
    this.root = document.createElement('div');

    Object.assign(this.root.style, {
      position: 'fixed',
      top: '18px',
      right: '18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      zIndex: '99999',
      pointerEvents: 'none',
    });

    document.body.appendChild(this.root);
    this.injectStyles();
  }

  public show(opts: NotifOptions): void {
    const {
      type,
      title,
      msg = '',
      duration = 4500,
      sound = true
    } = opts;

    if (sound) this.playSound();

    if (this.root.children.length >= this.MAX) {
      this.root.removeChild(this.root.firstChild!);
    }

    const id = `notif-${this.counter++}`;
    const color = COLORS[type];

    const el = document.createElement('div');
    el.className = 'mf-notif';
    el.id = id;

    el.innerHTML = `
      <div class="mf-icon">${ICONS[type]}</div>

      <div class="mf-body">
        <div class="mf-title">${title}</div>
        ${msg ? `<div class="mf-msg">${msg}</div>` : ''}
      </div>

      <button class="mf-close">✕</button>

      <div class="mf-bar" id="bar-${id}" style="background:${color}"></div>
    `;

    this.root.appendChild(el);

    /* close button */
    el.querySelector('.mf-close')?.addEventListener('click', () => {
      this.closeNotif(el);
    });

    /* timer bar */
    const bar = document.getElementById(`bar-${id}`)!;
    bar.style.transition = `width ${duration}ms linear`;

    requestAnimationFrame(() => {
      bar.style.width = '0%';
    });

    setTimeout(() => {
      this.closeNotif(el);
    }, duration);
  }

  private closeNotif(el: HTMLElement): void {
    if (el.classList.contains('mf-hide')) return;

    el.classList.add('mf-hide');
    setTimeout(() => el.remove(), 280);
  }

  private playSound(): void {
    this.audio.currentTime = 0;
    this.audio.volume = 0.55;
    this.audio.play().catch(() => {});
  }

  private injectStyles(): void {
    const style = document.createElement('style');

    style.textContent = `
      .mf-notif{
        width:360px;
        position:relative;
        overflow:hidden;

        display:flex;
        align-items:flex-start;
        gap:12px;

        padding:12px 14px 14px;

        border-radius:10px;

        background:
          linear-gradient(180deg,#ece1c9,#d8c39b);

        border:2px solid #8a6a34;

        box-shadow:
          0 6px 18px rgba(0,0,0,.28),
          inset 0 1px 0 rgba(255,255,255,.7);

        animation:mf-in .25s ease;
        pointer-events:auto;
      }

      .mf-hide{
        opacity:0;
        transform:translateX(24px);
        transition:.28s ease;
      }

      .mf-icon{
        width:38px;
        height:38px;
        border-radius:50%;
        flex-shrink:0;

        display:flex;
        align-items:center;
        justify-content:center;

        font-size:18px;
        font-weight:bold;

        color:#8a6a34;
        background:radial-gradient(circle,#f5ead0,#d8b66a);
        border:1px solid #8a6a34;
      }

      .mf-body{
        flex:1;
        padding-right:4px;
      }

      .mf-title{
        font-family:Georgia,serif;
        font-size:15px;
        font-weight:700;
        color:#2f2415;
        line-height:1.2;
      }

      .mf-msg{
        margin-top:4px;
        font-size:12px;
        line-height:1.35;
        color:#514633;
      }

      .mf-close{
        width:26px;
        height:26px;
        border:none;
        border-radius:6px;
        cursor:pointer;
        flex-shrink:0;

        background:rgb(144, 20, 20);
        color:#fff;
        font-size:14px;
        font-weight:bold;

        box-shadow:0 2px 5px rgba(0,0,0,.2);
      }

      .mf-close:hover{
        filter:brightness(1.08);
      }

      .mf-bar{
        position:absolute;
        left:0;
        bottom:0;
        width:100%;
        height:4px;
      }

      @keyframes mf-in{
        from{
          opacity:0;
          transform:translateX(20px);
        }
        to{
          opacity:1;
          transform:translateX(0);
        }
      }
    `;

    document.head.appendChild(style);
  }
}