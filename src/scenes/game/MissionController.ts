import { Engine } from './game/Engine';

enum MissionState {
  START,
  FIRST_WAVE,    // طيارتين
  SOLITARY_PLANE, // طيارة لوحدها
  SUPPORT_DECISION_SALHIA, // اختيار الصالحية
  SUPPORT_DECISION_TANTA,  // اختيار طنطا
  APPROACHING_MANSOURA,
  MANSOURA_BATTLE, // المعركة الكبرى (6 طيارات)
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
        // 1. رسالة التوجه للمنصورة
        this.engine.notif.show({
          type: 'info',
          title: 'أوامر القيادة',
          msg: 'توجه حالاً إلى المنصورة للمساعدة في المعركة!',
          duration: 5000
        });

        // انتظر ثواني ثم اظهر الأعداء
        setTimeout(() => {
          this.state = MissionState.FIRST_WAVE;
          this.spawnWave(2); // ظهور طيارتين
        }, 6000);
        break;

      case MissionState.SOLITARY_PLANE:
        setTimeout(() => {
          this.engine.notif.show({
            type: 'warn',
            title: 'تحذير',
            msg: 'طيارة معادية تقترب من الخلف!',
            duration: 3000
          });
          this.spawnWave(1);
        }, 4000);
        break;

      case MissionState.SUPPORT_DECISION_SALHIA:
        this.showDecision('نحتاج إلى دعم من السرب الخاص بك في الصالحية', (count) => {
          this.engine.notif.show({
            type: 'success',
            title: 'تم الإرسال',
            msg: `تم إرسال ${count} طائرات إلى الصالحية`,
          });
          this.state = MissionState.SUPPORT_DECISION_TANTA;
          this.runStateLogic();
        });
        break;

      case MissionState.SUPPORT_DECISION_TANTA:
        this.showDecision('نحتاج إلى دعم في طنطا', (count) => {
          this.engine.notif.show({
            type: 'success',
            title: 'تم الإرسال',
            msg: `تم إرسال ${count} طائرات إلى طنطا`,
          });
          this.state = MissionState.APPROACHING_MANSOURA;
          this.runStateLogic();
        });
        break;

      case MissionState.APPROACHING_MANSOURA:
        this.engine.notif.show({ type: 'info', title: 'ملاحة', msg: 'أنت تقترب من هدفك في المنصورة...' });
        setTimeout(() => {
          this.engine.notif.show({ type: 'warn', title: 'وصلت', msg: 'لقد وصلت إلى المنصورة! استعد!' });
          this.state = MissionState.MANSOURA_BATTLE;
          this.enemyKilledCount = 0;
          this.spawnWave(3); // ابدأ بـ 3 طيارات
        }, 5000);
        break;
    }
  }

  // دالة لمراقبة القتلى وتحديث الليفل
  public onEnemyKilled() {
    this.totalInWaveKilled++;
    
    if (this.state === MissionState.FIRST_WAVE && this.totalInWaveKilled === 2) {
      this.totalInWaveKilled = 0;
      this.state = MissionState.SOLITARY_PLANE;
      this.runStateLogic();
    } 
    else if (this.state === MissionState.SOLITARY_PLANE && this.totalInWaveKilled === 1) {
      this.totalInWaveKilled = 0;
      this.state = MissionState.SUPPORT_DECISION_SALHIA;
      this.runStateLogic();
    }
    else if (this.state === MissionState.MANSOURA_BATTLE) {
      this.enemyKilledCount++;
      if (this.enemyKilledCount < 6) {
        this.spawnWave(1); // كل ما واحدة تموت تظهر واحدة جديدة لغاية ما يوصلوا 6
      } else {
        this.victory();
      }
    }
  }

  private spawnWave(count: number) {
    // هنا هنستخدم الـ EnemyManager اللي عندك لعمل Spawn
    for(let i=0; i<count; i++) {
        (this.engine as any).enemies.spawnEnemy(); 
    }
  }

  private showDecision(text: string, onSelect: (count: number) => void) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      z-index: 10000; color: white; font-family: 'Cairo', sans-serif;
    `;
    overlay.innerHTML = `
      <h2 style="margin-bottom: 20px; text-align: center;">${text}</h2>
      <div style="display: flex; gap: 20px;">
        <button id="btn-1" style="padding: 10px 30px; cursor: pointer;">طائرة واحدة</button>
        <button id="btn-2" style="padding: 10px 30px; cursor: pointer;">طائرتان</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#btn-1')?.addEventListener('click', () => { overlay.remove(); onSelect(1); });
    overlay.querySelector('#btn-2')?.addEventListener('click', () => { overlay.remove(); onSelect(2); });
  }

  private victory() {
    this.engine.notif.show({
      type: 'success',
      title: 'نصر مبيناً',
      msg: 'تم دحر العدو بنجاح في المنصورة! انتظر الأوامر القادمة...',
      duration: 10000
    });
    // هنا ممكن تظهري شاشة Victory
  }
}