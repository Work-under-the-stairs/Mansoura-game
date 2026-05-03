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

  constructor(private engine: Engine) {}

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
    if (this.state !== MissionState.BATTLE_WAVE_1 && this.state !== MissionState.BATTLE_WAVE_2) return;

    this.waveKills++;
    console.log(`[MissionController2] Enemy killed. Wave kills: ${this.waveKills}/3`);

    if (this.state === MissionState.BATTLE_WAVE_1 && this.waveKills >= 3) {
      this.waveKills = 0;
      this.state = MissionState.BATTLE_WAVE_2;
      this.later(() => this.runStateLogic(), 2500);
    }
    else if (this.state === MissionState.BATTLE_WAVE_2 && this.waveKills >= 3) {
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
  private runLevel2Transition() {
    console.log('[MissionController2] Running transition sequence');
    
    // 1. Show the specific message
    this.engine.notif.show({
      type: 'info',
      title: 'أوامر القيادة',
      msg: 'انتقل إلى سيناء لحماية الجنود وضباط الجيش',
      duration: 6000
    });

    // 2. Plane appears in front
    if (this.engine.transitionPlane) {
        this.engine.transitionPlane.appearInFront();
    }

    // 3. Wait 2 seconds, then move plane to side and start wave 1
    this.later(() => {
        console.log('[MissionController2] 2 seconds passed. Moving plane and starting wave 1.');
        if (this.engine.transitionPlane) {
            this.engine.transitionPlane.moveToSide();
        }
        
        // 4. Start Wave 1 combat
        this.state = MissionState.BATTLE_WAVE_1;
        this.runStateLogic();
    }, 2000);
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
      (this.engine as any).enemies.spawnEnemy();
    }
  }

  private victory() {
    if (this.victoryDeclared) return;
    this.victoryDeclared = true;
    this.engine.notif.show({
      type: 'success',
      title: 'نصر مبين',
      msg: 'تم تحرير سيناء! أحسنت أيها الطيار!',
      duration: 10000
    });
  }
}
