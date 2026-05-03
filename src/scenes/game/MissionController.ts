import { Engine } from './Engine';

enum MissionState {
  START,
  FIRST_WAVE,
  SOLITARY_PLANE,
  SUPPORT_DECISION_SALHIA,
  SUPPORT_DECISION_TANTA,
  APPROACHING_MANSOURA,
  MANSOURA_BATTLE,
  VICTORY
}

export class MissionController {
  private state: MissionState = MissionState.START;
  private enemyKilledCount = 0;
  private totalInWaveKilled = 0;
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(private engine: Engine) {}

  public start() {
    this.runStateLogic();
  }

  // ✅ Reset everything back to initial state (called on restart)
  public reset() {
    // Cancel all pending timers so old logic doesn't fire after restart
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers = [];

    // Remove any leftover decision card from the DOM
    document.getElementById('decision-card')?.remove();

    // Reset state machine
    this.state = MissionState.START;
    this.enemyKilledCount = 0;
    this.totalInWaveKilled = 0;
  }

  // ✅ Helper: tracked setTimeout so we can cancel all on reset
  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      // Remove from list once it fires
      this.pendingTimers = this.pendingTimers.filter(t => t !== id);
      fn();
    }, ms);
    this.pendingTimers.push(id);
    return id;
  }

  private async runStateLogic() {
    switch (this.state) {
      case MissionState.START:
        this.engine.notif.show({
          type: 'info',
          title: 'أوامر القيادة',
          msg: 'توجه حالاً إلى المنصورة للمساعدة في المعركة!',
          duration: 5000
        });
        this.later(() => {
          this.state = MissionState.FIRST_WAVE;
          this.spawnWave(2);
        }, 6000);
        break;

      case MissionState.SOLITARY_PLANE:
        this.later(() => {
          this.engine.notif.show({
            type: 'warn', title: 'تحذير', msg: 'طيارة معادية تقترب من الخلف!', duration: 3000
          });
          this.spawnWave(1);
        }, 3000);
        break;

      case MissionState.SUPPORT_DECISION_SALHIA:
        this.later(() => {
          this.showDecision('دعم مطلوب: الصالحية', 'أرسل سرب دعم إلى منطقة الصالحية الآن؟', (count) => {
            this.engine.notif.show({
              type: 'success', title: 'تم الإرسال', msg: `تم توجيه ${count} طائرات للصالحية`,
            });
            this.state = MissionState.SUPPORT_DECISION_TANTA;
            this.runStateLogic();
          });
        }, 4000);
        break;

      case MissionState.SUPPORT_DECISION_TANTA:
        this.later(() => {
          this.showDecision('دعم مطلوب: طنطا', 'تحتاج قاعدة طنطا إلى مساندة فورية!', (count) => {
            this.engine.notif.show({
              type: 'success', title: 'تم الإرسال', msg: `تم توجيه ${count} طائرات لطنطا`,
            });
            this.state = MissionState.APPROACHING_MANSOURA;
            this.runStateLogic();
          });
        }, 5000);
        break;

      case MissionState.APPROACHING_MANSOURA:
        this.later(() => {
          this.engine.notif.show({ type: 'info', title: 'ملاحة', msg: 'أنت تقترب من هدفك في المنصورة...' });
          this.later(() => {
            this.engine.notif.show({ type: 'warn', title: 'وصلت', msg: 'لقد وصلت إلى المنصورة! استعد للمعركة الكبرى!' });
            this.state = MissionState.MANSOURA_BATTLE;
            this.enemyKilledCount = 0;
            this.spawnWave(3);
          }, 6000);
        }, 4000);
        break;
    }
  }

  public onEnemyKilled() {
    this.totalInWaveKilled++;

    if (this.state === MissionState.FIRST_WAVE && this.totalInWaveKilled >= 2) {
      this.totalInWaveKilled = 0;
      this.state = MissionState.SOLITARY_PLANE;
      this.runStateLogic();
    }
    else if (this.state === MissionState.SOLITARY_PLANE && this.totalInWaveKilled >= 1) {
      this.totalInWaveKilled = 0;
      this.state = MissionState.SUPPORT_DECISION_SALHIA;
      this.runStateLogic();
    }
    else if (this.state === MissionState.MANSOURA_BATTLE) {
      this.enemyKilledCount++;
      if (this.enemyKilledCount < 3) { //was 6
        this.later(() => this.spawnWave(1), 2000);
      } else {
        this.later(() => this.victory(), 3000);
      }
    }
  }

  private spawnWave(count: number) {
    this.totalInWaveKilled = 0;
    for (let i = 0; i < count; i++) {
      (this.engine as any).enemies.spawnEnemy();
    }
  }


  private showDecision(title: string, text: string, onSelect: (count: number) => void) {
    // 1. إزالة أي بطاقة قرار قديمة
    document.getElementById('decision-card')?.remove();

    const card = document.createElement('div');
    card.id = 'decision-card';
    
    // استخدمي نفس الكلاس mf-notif عشان ياخد نفس الستايل (الخلفية والحدود والظل)
    card.className = 'mf-notif'; 
    
    // ضبط مكان البطاقة يدويًا لأنها خارج نظام الـ Stack بتاع النوتفيكيشن
    Object.assign(card.style, {
      position: 'fixed',
      top: '120px', // تحت النوتفيكيشنز الأولى
      right: '18px',
      zIndex: '100000',
      pointerEvents: 'auto',
      flexDirection: 'column', // عشان الزراير تنزل تحت الكلام
      width: '360px',
      animation: 'mf-in 0.4s ease-out',
      direction: 'rtl'
    });

    card.innerHTML = `
      <style>
        .decision-actions {
          display: flex;
          gap: 10px;
          margin-top: 15px;
          width: 100%;
        }
        .decision-btn {
          flex: 1;
          padding: 10px;
          border: 1px solid #8a6a34;
          border-radius: 6px;
          background: radial-gradient(circle, #f5ead0, #d8b66a);
          color: #2f2415;
          font-family: Georgia, serif;
          font-size: 13px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.1s, filter 0.2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .decision-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .decision-btn:active {
          transform: translateY(0);
        }
      </style>

      <div style="display: flex; gap: 12px; width: 100%;">
        <div class="mf-icon">?</div>
        <div class="mf-body">
          <div class="mf-title">${title}</div>
          <div class="mf-msg">${text}</div>
        </div>
      </div>

      <div class="decision-actions">
        <button class="decision-btn" id="opt-1">طائرة واحدة</button>
        <button class="decision-btn" id="opt-2">طائرتان</button>
      </div>
      
      <!-- شريط مزخرف سفلي بنفس لون الـ info -->
      <div class="mf-bar" style="background: #556B2F; width: 100%;"></div>
    `;

    document.body.appendChild(card);

    card.querySelector('#opt-1')?.addEventListener('click', () => { 
      this.closeDecision(card); 
      onSelect(1); 
    });
    
    card.querySelector('#opt-2')?.addEventListener('click', () => { 
      this.closeDecision(card); 
      onSelect(2); 
    });
  }

  // دالة لإغلاق القرار بنفس حركة النوتفيكيشن
  private closeDecision(el: HTMLElement) {
    el.classList.add('mf-hide');
    setTimeout(() => el.remove(), 280);
  }

  private victory() {
    this.engine.notif.show({
      type: 'success', title: 'نصر مبيناً',
      msg: 'تم دحر العدو بنجاح في المنصورة! انتظر الأوامر القادمة...',
      duration: 10000
    });
  }
}