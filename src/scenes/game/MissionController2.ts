import { Engine } from './Engine';

enum MissionState {
  START,
  BATTLE_WAVE_1,
  BATTLE_WAVE_2,
  VICTORY
}

export class MissionController2 {
  private state: MissionState = MissionState.START;
  private waveKills = 0;
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];
  private victoryDeclared = false;

  constructor(private engine: Engine) { }

  /** 
   * Entry point called by Engine when Level 2 starts.
   * We immediately run the transition sequence.
   */
  public start() {
    console.log('[MissionController2] Starting Level 2...');
    this.runLevel2Transition();
  }

  public reset() {
    console.log('[MissionController2] Resetting Level 2 state');
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers = [];
    this.state = MissionState.START;
    this.waveKills = 0;
    this.victoryDeclared = false;

    if (this.engine.transitionPlane) {
      this.engine.transitionPlane.reset();
    }
  }

  public onEnemyKilled() {
  // Only count kills if we are actually in a battle state
  if (this.state !== MissionState.BATTLE_WAVE_1 && this.state !== MissionState.BATTLE_WAVE_2) {
    console.log(`[MissionController2] Enemy killed but state is ${this.state}, ignoring`);
    return;
  }

  this.waveKills++;
  console.log(`[MissionController2] Enemy killed. Wave kills: ${this.waveKills}/3, State: ${this.state}`);

  if (this.state === MissionState.BATTLE_WAVE_1 && this.waveKills >= 3) {
    console.log('[MissionController2] Wave 1 complete! Moving to Wave 2');
    this.waveKills = 0;
    this.state = MissionState.BATTLE_WAVE_2;
    this.later(() => this.runStateLogic(), 2500);
  }
  else if (this.state === MissionState.BATTLE_WAVE_2 && this.waveKills >= 3) {
    console.log('[MissionController2] Wave 2 complete! VICTORY!');
    this.waveKills = 0;
    this.state = MissionState.VICTORY;
    this.later(() => this.victory(), 2000);
  }
}

  /**
   * Sequence for Level 2 Start:
   * 1. Show Message.
   * 2. Plane appears in front for 2 seconds.
   * 3. Plane moves to side.
   * 4. Wave 1 begins.
   */
  /**
   * Sequence for Level 2 Start:
   * t=0s  → Notification message shown.
   * t=1s  → Companion plane snaps in front, same height & direction as cockpit.
   * t=6s  → Plane smoothly glides to side formation (stays locked to cockpit forever).
   * t=6s  → Wave 1 enemies spawn.
   */
  private runLevel2Transition() {
    console.log('[MissionController2] Running transition sequence');

    // 1. Show the notification message first
    this.engine.notif.show({
      type: 'info',
      title: 'أوامر القيادة',
      msg: 'انتقل إلى سيناء لحماية الجنود وضباط الجيش',
      duration: 7000
    });
    this.engine.notif.show({
      type: 'info',
      title: 'أوامر القيادة',
      msg: 'عليك حماية طائرة نقل الجنود من الهجمات المعادية',
      duration: 7000
    });

    // 2. After 1s companion plane appears in front (instant snap, same heading/height)
    this.later(() => {
      console.log('[MissionController2] Companion plane appearing in front.');
      if (this.engine.transitionPlane) {
        this.engine.transitionPlane.appearInFront();
      }

      // 3. Hold 5 seconds in front, then slide to side formation
      this.later(() => {
        console.log('[MissionController2] Moving plane to side formation. Starting wave 1.');
        if (this.engine.transitionPlane) {
          this.engine.transitionPlane.moveToSide();
        }

        // 4. Start Wave 1 combat
        this.state = MissionState.BATTLE_WAVE_1;
        this.runStateLogic();
      }, 5000);
    }, 1000);
  }

  public getMissionState(): boolean {
    return this.victoryDeclared;
  }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.pendingTimers = this.pendingTimers.filter(t => t !== id);
      fn();
    }, ms);
    this.pendingTimers.push(id);
    return id;
  }

  private runStateLogic() {
    switch (this.state) {
      case MissionState.BATTLE_WAVE_1:
        this.engine.notif.show({
          type: 'warn',
          title: 'تحذير',
          msg: 'العدو يهاجم! ثلاث طائرات معادية اقتربت!',
          duration: 4000
        });
        this.spawnWave(3);
        break;

      case MissionState.BATTLE_WAVE_2:
        this.engine.notif.show({
          type: 'warn',
          title: 'موجة ثانية',
          msg: 'ثلاث طائرات معادية أخرى في الأفق!',
          duration: 4000
        });
        this.spawnWave(3);
        break;
    }
  }

  private spawnWave(count: number) {
  this.waveKills = 0;
  console.log(`[MissionController2] Spawning wave with ${count} enemies`);
  for (let i = 0; i < count; i++) {
    console.log(`[MissionController2] Spawning enemy ${i + 1}/${count}`);
    (this.engine as any).enemies.spawnEnemy();
  }
}

private victory() {
  if (this.victoryDeclared) return;
  this.victoryDeclared = true;

  console.log('[MissionController2] VICTORY! Showing popup');

  const audio = new Audio('/sounds/vectory.m4a');
  audio.loop = false;
  audio.volume = 0.8;
  audio.preload = 'auto'; // 👈 eagerly load the file

  const startTime = 193;
  const endTime = 207;

  const playClip = () => {
    audio.currentTime = startTime;
    audio.play().catch(err => console.warn('Audio blocked:', err));
  };

  const checkTime = () => {
    if (audio.currentTime >= endTime) {
      audio.pause();
      audio.removeEventListener('timeupdate', checkTime);
    }
  };

  audio.addEventListener('timeupdate', checkTime);

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    playClip();
  } else {
    audio.addEventListener('loadedmetadata', playClip, { once: true });
  }

  // 👇 Small delay so audio context initializes before popup renders
  setTimeout(() => {
    this.showWinPopup();
  }, 100);
}

private showWinPopup() {
  if (!document.getElementById('win-popup-styles')) {
    const styles = document.createElement('style');
    styles.id = 'win-popup-styles';
    styles.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Courier+Prime:wght@400;700&display=swap');

      :root {
        --beige: #c9a84c;
        --green: #556b2f;
        --red: #8B1A1A;
        --beige-dim: rgba(201,168,76,0.15);
        --beige-border: rgba(201,168,76,0.4);
        --panel: rgba(12,14,8,0.97);
      }

      #win-popup {
        position: fixed;
        inset: 0;
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at center, rgba(0,0,0,0.7), rgba(0,0,0,0.93));
        backdrop-filter: blur(6px);
        animation: winFadeIn 0.4s ease;
        font-family: 'Courier Prime', monospace;
      }

      .win-box {
        width: 540px;
        max-width: 92vw;
        background: var(--panel);
        border: 1px solid var(--beige-border);
        position: relative;
        overflow: hidden;
        animation: winSlideUp 0.45s cubic-bezier(0.22,1,0.36,1);
        outline: 1px solid rgba(85,107,47,0.3);
        outline-offset: 4px;
      }

      .win-box::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 3px;
        background: #50652C;
      }

      .win-box::after {
        content: '';
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
          0deg, transparent, transparent 4px,
          rgba(201,168,76,0.018) 4px, rgba(201,168,76,0.018) 5px
        );
        pointer-events: none;
      }

      .win-header {
        background: #50652c;
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(201,168,76,0.3);
      }

      .win-header-label {
        font-family: 'Courier Prime', monospace;
        font-size: 9px;
        letter-spacing: 4px;
        color: rgba(201,168,76,0.85);
        text-transform: uppercase;
      }

      .win-header-flag {
        font-size: 16px;
        letter-spacing: 2px;
      }

      .win-body {
        padding: 14px 28px 12px;  /* was 22px 28px 20px */
        text-align: center;
        position: relative;
        z-index: 1;
      }

      .win-eagle {
        font-size: 32px;          /* was 44px */
        display: block;
        margin-bottom: 4px;       /* was 8px */
        filter: drop-shadow(0 0 10px rgba(201,168,76,0.45));
      }

      .win-title {
        font-family: 'Amiri', serif;
        font-size: 26px;          /* was 34px */
        font-weight: 700;
        color: var(--beige);
        letter-spacing: 3px;
        text-shadow: 0 0 18px rgba(201,168,76,0.3);
        line-height: 1;
        margin-bottom: 3px;       /* was 4px */
      }

      .win-sub {
        font-size: 9px;           /* was 10px */
        letter-spacing: 4px;
        color: var(--green);
        opacity: 0.9;
        margin-bottom: 10px;      /* was 16px */
        text-shadow: 0 0 6px rgba(85,107,47,0.6);
      }

      .win-divider {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;      /* was 14px */
      }

      .victory-stats {
        background: rgba(0,0,0,0.5);
        border: 1px solid rgba(85,107,47,0.35);
        border-left: 2px solid var(--green);
        padding: 8px 16px;        /* was 12px 16px */
        margin-bottom: 10px;      /* was 16px */
        text-align: right;
        direction: rtl;
      }

      .victory-stats p {
        font-family: 'Courier Prime', monospace;
        font-size: 11px;          /* was 12px */
        color: rgba(201,168,76,0.85);
        margin: 4px 0;            /* was 6px 0 */
        line-height: 1.4;         /* was 1.5 */
        letter-spacing: 0.5px;
      }

      #win-btn-retry {
        width: 100%;
        padding: 10px;            /* was 13px */
        border: 1px solid var(--beige-border);
        cursor: pointer;
        background: transparent;
        color: var(--beige);
        font-family: 'Courier Prime', monospace;
        font-size: 11px;          /* was 12px */
        font-weight: 700;
        letter-spacing: 4px;
        transition: border-color 0.2s, color 0.2s;
        position: relative;
        overflow: hidden;
      }

      .win-footer {
        padding: 6px 20px;        /* was 8px 20px */
        background: rgba(0,0,0,0.4);
        border-top: 1px solid rgba(201,168,76,0.15);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .win-footer span {
        font-size: 8px;
        letter-spacing: 3px;
        color: rgba(201,168,76,0.35);
        text-transform: uppercase;
      }

      .win-footer .status-dot {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: var(--green);
        box-shadow: 0 0 6px var(--green);
        animation: winPulse 2s infinite;
      }

      @keyframes winPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }

      @keyframes winFadeIn {
        from { opacity: 0; } to { opacity: 1; }
      }

      @keyframes winSlideUp {
        from { opacity: 0; transform: translateY(30px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(styles);
  }

  const popup = document.createElement('div');
  popup.id = 'win-popup';

  const enemyLosses = Math.floor(Math.random() * (44 - 17 + 1) + 17);

  popup.innerHTML = `
    <div class="win-box">
      <div class="win-header">
        <span class="win-header-label">Mission Complete</span>
        <span class="win-header-flag">🇪🇬</span>
        <span class="win-header-label">6 أكتوبر 1973</span>
      </div>

      <div class="win-body">
        <span class="win-eagle">🦅</span>
        <div class="win-title">النصر</div>
        <div class="win-sub">الله أكبر • تحرير سيناء</div>

        <div class="win-divider">
          <div class="win-divider-line"></div>
          <div class="win-divider-diamond"></div>
          <div class="win-divider-line"></div>
        </div>

        <div class="victory-stats">
          <p>📊 <span class="highlight">15 طائرة</span> تم تدميرها من المواجهة الجوية</p>
          <p>🛡️ خسائر العدو: <span class="highlight">${enemyLosses} طائرة</span> من ضربات الدفاع الجوي</p>
          <p class="honor">🎖️ تحية لشهدائنا الأبرار • تحية لجيشنا الباسل</p>
        </div>

        <button id="win-btn-retry"><span>↺ ارجع إلى المطار يا قائد</span></button>
      </div>

      <div class="win-footer">
        <span>القوات الجوية المصرية</span>
        <div class="status-dot"></div>
        <span>Victory Confirmed</span>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const clickSound = new Audio('/sounds/click.mp3');
  clickSound.volume = 0.3;

  document.getElementById('win-btn-retry')?.addEventListener('click', () => {
    clickSound.play().catch(() => {});
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
  });

  this.addVictoryConfetti();
}

private addVictoryConfetti(): void {
  const colors = ['#c9a84c', '#556b2f', '#8B1A1A', '#d4b96a', '#ffffff'];

  for (let i = 0; i < 80; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'fixed';
    confetti.style.width = Math.random() * 7 + 3 + 'px';
    confetti.style.height = Math.random() * 7 + 3 + 'px';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.top = '-10px';
    confetti.style.zIndex = '19999';
    confetti.style.pointerEvents = 'none';
    confetti.style.opacity = String(Math.random() * 0.7 + 0.3);
    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    document.body.appendChild(confetti);

    const duration = Math.random() * 3 + 2;
    const delay = Math.random() * 2;
    const endX = (Math.random() - 0.5) * 200;

    confetti.animate([
      { transform: `translate(0, 0) rotate(0deg)`, opacity: 0.8 },
      { transform: `translate(${endX}px, ${window.innerHeight + 100}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }
    ], {
      duration: duration * 1000,
      delay: delay * 1000,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'forwards'
    });

    setTimeout(() => confetti.remove(), (duration + delay) * 1000 + 500);
  }
}
}
