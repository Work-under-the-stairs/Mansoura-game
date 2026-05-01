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

  constructor(private engine: Engine) {}

  public start() {
    this.runStateLogic();
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
        setTimeout(() => {
          this.state = MissionState.FIRST_WAVE;
          this.spawnWave(2);
        }, 6000);
        break;

      case MissionState.SOLITARY_PLANE:
        // ✅ إضافة وقت قبل ظهور الطيارة الثالثة
        setTimeout(() => {
          this.engine.notif.show({
            type: 'warn', title: 'تحذير', msg: 'طيارة معادية تقترب من الخلف!', duration: 3000
          });
          this.spawnWave(1);
        }, 3000); 
        break;

      case MissionState.SUPPORT_DECISION_SALHIA:
        // ✅ إضافة وقت بين موت الطيارة ورسالة الصالحية
        setTimeout(() => {
          this.showDecision('دعم مطلوب: الصالحية', 'أرسل سرب دعم إلى منطقة الصالحية الآن؟', (count) => {
            this.engine.notif.show({
              type: 'success', title: 'تم الإرسال', msg: `تم توجيه ${count} طائرات للصالحية`,
            });
            this.state = MissionState.SUPPORT_DECISION_TANTA;
            this.runStateLogic();
          });
        }, 4000); // 4 ثواني هدوء
        break;

      case MissionState.SUPPORT_DECISION_TANTA:
        // ✅ إضافة وقت بين قرار الصالحية وقرار طنطا
        setTimeout(() => {
          this.showDecision('دعم مطلوب: طنطا', 'تحتاج قاعدة طنطا إلى مساندة فورية!', (count) => {
            this.engine.notif.show({
              type: 'success', title: 'تم الإرسال', msg: `تم توجيه ${count} طائرات لطنطا`,
            });
            this.state = MissionState.APPROACHING_MANSOURA;
            this.runStateLogic();
          });
        }, 5000); // 5 ثواني فاصل
        break;

      case MissionState.APPROACHING_MANSOURA:
        // ✅ إضافة وقت قبل رسالة الاقتراب من المنصورة
        setTimeout(() => {
          this.engine.notif.show({ type: 'info', title: 'ملاحة', msg: 'أنت تقترب من هدفك في المنصورة...' });
          setTimeout(() => {
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
      if (this.enemyKilledCount < 6) {
        setTimeout(() => this.spawnWave(1), 2000); // تأخير بسيط بين كل طيارة تظهر في المعركة الكبرى
      } else {
        setTimeout(() => this.victory(), 3000);
      }
    }
  }

  private spawnWave(count: number) {
    this.totalInWaveKilled = 0; 
    for(let i=0; i<count; i++) {
        (this.engine as any).enemies.spawnEnemy(); 
    }
  }

  // ✅ نظام اتخاذ القرار بتصميم يشبه النوتفيكيشن
  private showDecision(title: string, text: string, onSelect: (count: number) => void) {
    const card = document.createElement('div');
    card.id = 'decision-card';
    card.style.cssText = `
      position: fixed; top: 120px; right: 12px;
      width: 280px; background: rgba(15, 15, 25, 0.95);
      border-left: 3px solid #378ADD; border-radius: 12px;
      padding: 16px; color: white; font-family: sans-serif;
      z-index: 100000; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px); animation: slideIn 0.4s ease-out;
      direction: rtl;
    `;

    card.innerHTML = `
      <style>
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .decision-btn {
          margin-top: 12px; padding: 6px 15px; background: #378ADD;
          border: none; color: white; border-radius: 4px; cursor: pointer;
          font-weight: bold; font-size: 11px; transition: 0.2s;
        }
        .decision-btn:hover { background: #4ca1f5; }
      </style>
      <div style="font-weight: bold; color: #85B7EB; font-size: 13px; margin-bottom: 5px;">${title}</div>
      <div style="font-size: 11px; color: #aab2c5; line-height: 1.5;">${text}</div>
      <div style="display: flex; gap: 10px;">
        <button class="decision-btn" id="opt-1">طائرة واحدة</button>
        <button class="decision-btn" id="opt-2">طائرتان</button>
      </div>
    `;

    document.body.appendChild(card);

    card.querySelector('#opt-1')?.addEventListener('click', () => { card.remove(); onSelect(1); });
    card.querySelector('#opt-2')?.addEventListener('click', () => { card.remove(); onSelect(2); });
  }

  private victory() {
    this.engine.notif.show({
      type: 'success', title: 'نصر مبيناً',
      msg: 'تم دحر العدو بنجاح في المنصورة! انتظر الأوامر القادمة...',
      duration: 10000
    });
  }
}