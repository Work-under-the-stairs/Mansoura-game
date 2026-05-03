import * as THREE from 'three';
import { Cockpit } from './Cockpit';
import { EnemyManager } from './EnemyManager';
import { ProjectileManager } from './ProjectileManager';
import { NotificationSystem } from './NotificationSystem';

// ───────────────────────────────────────────────────────────────
//  SoundSystem  — lightweight audio manager
// ───────────────────────────────────────────────────────────────
// ── Sound clip definition ─────────────────────────────────────
interface SoundClip {
  file:     string;  // path to audio file in /public/sounds/
  start:    number;  // ✅ start time in seconds within the file
  duration: number;  // ✅ how long to play in seconds
}

class SoundSystem {
  private ctx:    AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();

  // ═══════════════════════════════════════════════════════════
  //  ✅ CONFIGURE YOUR SOUNDS HERE
  //  file     → path inside /public/
  //  start    → where in the file to start (seconds)
  //  duration → how long to play (seconds)
  // ═══════════════════════════════════════════════════════════
  private readonly clips: Record<string, SoundClip> = {
    bullet_hit: {
      file:     '/sounds/foisal72-gun-fire-346766.mp3',
      start:    0.0,   // ← change this  e.g. 1.2
      duration: 1.2,   // ← change this  e.g. 0.4
    },
    missile_hit: {
      file:     '/sounds/voicebosch-missile-explosion-168600.mp3',
      start:    0.0,   // ← change this  e.g. 3.8
      duration: 1.5,   // ← change this  e.g. 0.8
    },
    explosion: {
      file:     '/sounds/dragon-studio-nuclear-explosion-386181.mp3',
      start:    0.0,   // ← change this  e.g. 6.0
      duration: 1,   // ← change this  e.g. 1.5
    },
  };
  // ═══════════════════════════════════════════════════════════

  constructor() {
    const resume = () => {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.loadAll();
      } else if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };
    window.addEventListener('click',   resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  private async loadAll(): Promise<void> {
    // Deduplicate — if two clips share the same file, load it once
    const fileMap = new Map<string, string>(); // file → key
    for (const [key, clip] of Object.entries(this.clips)) {
      if (!fileMap.has(clip.file)) fileMap.set(clip.file, key);
    }

    const buffers = new Map<string, AudioBuffer>();
    for (const [file] of fileMap) {
      try {
        const res     = await fetch(file);
        const arr     = await res.arrayBuffer();
        const decoded = await this.ctx!.decodeAudioData(arr);
        buffers.set(file, decoded);
      } catch (e) {
        console.warn(`[SoundSystem] Could not load "${file}":`, e);
      }
    }

    // Map each clip key to its decoded buffer
    for (const [key, clip] of Object.entries(this.clips)) {
      const buf = buffers.get(clip.file);
      if (buf) this.sounds.set(key, buf);
    }
  }

  /**
   * Play a specific clip (uses start + duration from clips config).
   * @param key      Clip key: 'bullet_hit' | 'missile_hit' | 'explosion'
   * @param volume   0–1  (default 1)
   * @param pitchVar Random pitch shift ± fraction (default 0.08)
   */
  public play(key: string, volume = 1.0, pitchVar = 0.08): void {
    if (!this.ctx || !this.sounds.has(key)) return;

    const clip   = this.clips[key];
    const buf    = this.sounds.get(key)!;
    const source = this.ctx.createBufferSource();
    const gain   = this.ctx.createGain();

    source.buffer             = buf;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchVar;
    gain.gain.value           = volume;

    source.connect(gain);
    gain.connect(this.ctx.destination);

    // ✅ start(when, offset, duration) — plays only the configured slice
    source.start(0, clip.start, clip.duration);
  }
}

// ───────────────────────────────────────────────────────────────
//  HealthSystem  (self-contained — owns HUD DOM)
// ───────────────────────────────────────────────────────────────
class HealthSystem {
  public hp     = 100;
  public maxHp  = 100;
  public isDead = false;

  public shakeTimer     = 0;
  public shakeIntensity = 0;
  private readonly SHAKE_DURATION = 0.40;

  private cameraBasePos    = new THREE.Vector3();
  private cameraBasePosSet = false;

  private hudFill:    HTMLElement;
  private hudLabel:   HTMLElement;
  private hudPct:     HTMLElement;
  private hitOverlay: HTMLElement;
  private deathEl:    HTMLElement;

  public onRestartCallback?: () => void;
  public onExitCallback?:    () => void;

  constructor(
    private cockpit: Cockpit,
    private onDeathCallback?: () => void,
    onRestartCallback?: () => void,
    onExitCallback?: () => void,
  ) {
    this.onRestartCallback = onRestartCallback;
    this.onExitCallback    = onExitCallback;
    this.buildHUD();
    this.hudFill    = document.getElementById('cs-hp-fill')!;
    this.hudLabel   = document.getElementById('cs-hp-label')!;
    this.hudPct     = document.getElementById('cs-hp-pct')!;
    this.hitOverlay = document.getElementById('cs-hit-overlay')!;
    this.deathEl    = document.getElementById('cs-death')!;
  }

  // ── Public ────────────────────────────────────────────────────

  public takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.refreshBar();
    this.flashScreen();
    this.shakeTimer     = this.SHAKE_DURATION;
    this.shakeIntensity = amount * 0.00008;
    if (this.hp <= 0) this.onDeath();
  }

  public update(delta: number): void {
    if (this.shakeTimer <= 0) return;
    const model = this.cockpit.model;
    if (!model) return;

    const cam = model.children.find(c => c instanceof THREE.PerspectiveCamera) as THREE.PerspectiveCamera | undefined;
    if (cam && !this.cameraBasePosSet) {
      this.cameraBasePos.copy(cam.position);
      this.cameraBasePosSet = true;
    }

    this.shakeTimer -= delta;
    const t   = Math.max(0, this.shakeTimer / this.SHAKE_DURATION);
    const mag = this.shakeIntensity * t * t;

    if (cam) {
      cam.position.set(
        this.cameraBasePos.x + (Math.random() - 0.5) * mag * 0.8,
        this.cameraBasePos.y + (Math.random() - 0.5) * mag * 0.8,
        this.cameraBasePos.z + (Math.random() - 0.5) * mag * 0.4,
      );
    }
    model.rotation.x += (Math.random() - 0.5) * mag * 0.18;
    model.rotation.z += (Math.random() - 0.5) * mag * 0.18;

    if (this.shakeTimer <= 0 && cam && this.cameraBasePosSet) {
      cam.position.copy(this.cameraBasePos);
    }
  }

  public reset(): void {
    this.hp               = this.maxHp;
    this.isDead           = false;
    this.shakeTimer       = 0;
    this.shakeIntensity   = 0;
    this.cameraBasePosSet = false;
    this.refreshBar();
    this.deathEl.classList.remove('cs-visible');
    this.deathEl.style.visibility    = 'hidden';
    this.deathEl.style.opacity       = '0';
    this.deathEl.style.pointerEvents = 'none';
  }

  public dispose(): void {
    document.getElementById('cs-hud-root')?.remove();
  }

  // ── Private ───────────────────────────────────────────────────

  private refreshBar(): void {
    const pct    = this.hp / this.maxHp;
    const pctInt = Math.round(pct * 100);
    this.hudFill.style.width = `${pct * 100}%`;
    this.hudPct.textContent  = `${pctInt}%`;
    if (pct > 0.5) {
      this.hudFill.style.background = '#556b2f';
      this.hudLabel.style.color     = '#c9a84c';
      this.hudPct.style.color       = '#c9a84c';
    } else if (pct > 0.25) {
      this.hudFill.style.background = '#7a6a1a';
      this.hudLabel.style.color     = '#e8c84a';
      this.hudPct.style.color       = '#e8c84a';
    } else {
      this.hudFill.style.background = '#8B1A1A';
      this.hudLabel.style.color     = '#c9a84c';
      this.hudPct.style.color       = '#ff6b6b';
    }
  }

  private flashScreen(): void {
    this.hitOverlay.style.opacity = '1';
    setTimeout(() => { this.hitOverlay.style.opacity = '0'; }, 100);
  }

  private onDeath(): void {
    this.isDead = true;
    this.deathEl.style.visibility    = 'visible';
    this.deathEl.style.pointerEvents = 'all';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.deathEl.classList.add('cs-visible');
      });
    });
    this.shakeTimer     = 3.0;
    this.shakeIntensity = 0.0006;
    this.onDeathCallback?.();
  }

  private buildHUD(): void {
    document.getElementById('cs-hud-root')?.remove();

    const root = document.createElement('div');
    root.id = 'cs-hud-root';

    root.innerHTML = `
    <style>
      #cs-hud-root {
        position: fixed;
        inset: 0;
        z-index: 999;
        pointer-events: none;
        visibility: hidden;
      }

      /* ── Health bar ── */
      #cs-hull-hud {
        position: fixed;
        top: 28px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        z-index: 1000;
      }
      #cs-hp-tag {
        padding: 5px 10px;
        background: rgba(201,168,76,.12);
        border: 1px solid rgba(201,168,76,.35);
        border-right: none;
        display: flex; align-items: center;
        clip-path: polygon(0 0, 100% 0, 100% 100%, 8px 100%);
      }
      #cs-hp-label {
        font-family: 'Courier New', monospace;
        font-size: 9px; letter-spacing: 3px; color: #c9a84c;
      }
      #cs-hp-bar-wrap {
        width: 340px; height: 28px;
        position: relative;
        background: rgba(201,168,76,.06);
        border: 1px solid rgba(201,168,76,.25);
        border-left: none; border-right: none;
        overflow: hidden;
      }
      #cs-hp-fill {
        position: absolute; inset: 0; width: 100%;
        background: #556b2f;
        transition: width .15s ease, background .3s ease;
      }
      #cs-hp-scanline {
        position: absolute; inset: 0;
        background: repeating-linear-gradient(
          90deg, transparent, transparent 8px,
          rgba(0,0,0,.15) 8px, rgba(0,0,0,.15) 9px
        );
      }
      #cs-hp-pct-wrap {
        padding: 5px 10px;
        background: rgba(201,168,76,.12);
        border: 1px solid rgba(201,168,76,.35);
        border-left: none;
        display: flex; align-items: center;
        clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
      }
      #cs-hp-pct {
        font-family: 'Courier New', monospace;
        font-size: 11px; font-weight: 700; color: #c9a84c;
        min-width: 36px; text-align: center;
      }

      /* ── Hit vignette ── */
      #cs-hit-overlay {
        position: fixed; inset: 0; z-index: 9998;
        opacity: 0; transition: opacity .15s ease;
        background: radial-gradient(
          ellipse at center, transparent 40%, rgba(139,26,26,.45) 100%
        );
      }

      /* ── Death screen ── */
      #cs-death {
        position: fixed; inset: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle, rgba(0,0,0,.45), rgba(0,0,0,.88));
        visibility: hidden; opacity: 0; pointer-events: none;
        transition: opacity .45s ease;
        overflow: hidden;
      }
      #cs-death.cs-visible {
        visibility: visible; opacity: 1; pointer-events: auto;
      }
      #cs-death-card {
        width: 500px; max-width: 92vw;
        border: 1px solid rgba(255,80,80,.35);
        background: linear-gradient(180deg, rgba(20,0,0,.92), rgba(5,5,5,.96));
        box-shadow: 0 0 30px rgba(255,0,0,.15), inset 0 0 30px rgba(255,0,0,.05);
        padding: 32px; text-align: center;
        position: relative; overflow: hidden;
      }
      #cs-death-card::before {
        content: ''; position: absolute; inset: 0;
        background: repeating-linear-gradient(
          0deg, transparent, transparent 3px,
          rgba(255,255,255,.02) 3px, rgba(255,255,255,.02) 4px
        );
        pointer-events: none;
      }
      #cs-warning {
        font-family: 'Courier New', monospace;
        font-size: 11px; letter-spacing: 6px; color: #ff9a9a;
        margin-bottom: 14px; opacity: .8;
      }
      #cs-skull {
        font-size: 58px; margin-bottom: 10px;
        filter: drop-shadow(0 0 10px rgba(255,0,0,.35));
      }
      #cs-death-title {
        font-family: 'Courier New', monospace;
        font-size: 44px; font-weight: 700; letter-spacing: 10px;
        color: #ff3d3d; margin-bottom: 8px;
        text-shadow: 0 0 14px rgba(255,0,0,.25);
      }
      #cs-death-sub {
        font-family: 'Courier New', monospace;
        font-size: 12px; letter-spacing: 4px; color: #d4c08a;
        margin-bottom: 28px; opacity: .85;
      }
      #cs-btn-retry {
        width: 100%; padding: 16px;
        border: none; cursor: pointer;
        background: linear-gradient(90deg, #556b2f, #6f8c3b);
        color: #fff; font-family: 'Courier New', monospace;
        font-size: 12px; font-weight: 700; letter-spacing: 4px;
        transition: transform .15s ease, filter .2s ease;
        pointer-events: auto;
      }
      #cs-btn-retry:hover  { transform: translateY(-2px); filter: brightness(1.1); }
      #cs-btn-retry:active { transform: translateY(0); }
      #cs-footer {
        margin-top: 18px; font-family: 'Courier New', monospace;
        font-size: 9px; letter-spacing: 3px; color: rgba(255,255,255,.35);
      }
    </style>

    <div id="cs-hit-overlay"></div>

    <div id="cs-hull-hud">
      <div id="cs-hp-tag"><span id="cs-hp-label">HULL</span></div>
      <div id="cs-hp-bar-wrap">
        <div id="cs-hp-fill"></div>
        <div id="cs-hp-scanline"></div>
      </div>
      <div id="cs-hp-pct-wrap"><span id="cs-hp-pct">100%</span></div>
    </div>

    <div id="cs-death">
      <div id="cs-death-card">
        <div id="cs-warning">AIRCRAFT STATUS</div>
        <div id="cs-skull">☠</div>
        <div id="cs-death-title">DESTROYED</div>
        <div id="cs-death-sub">AIRFRAME LOST • PILOT EJECT REQUIRED</div>
        <button id="cs-btn-retry">↺ REDEPLOY MISSION</button>
        <div id="cs-footer">EGYPTIAN AIR FORCE • 1973</div>
      </div>
    </div>
    `;

    document.body.appendChild(root);

    document.getElementById('cs-btn-retry')?.addEventListener('click', () => {
      this.onRestartCallback?.();
    });
  }
}

// ───────────────────────────────────────────────────────────────
//  Enemy projectile
// ───────────────────────────────────────────────────────────────
interface EnemyShot {
  mesh:      THREE.Object3D;
  velocity:  THREE.Vector3;
  life:      number;
  isMissile: boolean;
  owner:     THREE.Object3D;
}

// ───────────────────────────────────────────────────────────────
//  CombatSystem
// ───────────────────────────────────────────────────────────────
export class CombatSystem {

  public readonly health: HealthSystem;

  // ✅ Sound system instance
  private readonly sound = new SoundSystem();

  private readonly ENGAGE_DIST        = 120_000;
  private readonly BULLET_SPEED       = 12_000;
  private readonly MISSILE_SPEED      =  5_000;
  private readonly BULLET_LIFE        = 10.0;
  private readonly MISSILE_LIFE       = 12.0;
  private readonly BULLET_DAMAGE      = 3;
  private readonly MISSILE_DAMAGE     = 10;
  private readonly HIT_R_BULLET       = 500;
  private readonly HIT_R_MISSILE      = 500;
  private readonly SHOOT_INTERVAL_MIN = 2.0;
  private readonly SHOOT_INTERVAL_MAX = 5.0;

  private readonly PLAYER_BULLET_DMG   = 25;
  private readonly PLAYER_MISSILE_DMG  = 50;
  private readonly ENEMY_HIT_R_BULLET  = 9000;
  private readonly ENEMY_HIT_R_MISSILE = 3500;

  private readonly bulletGeo:   THREE.CylinderGeometry;
  private readonly bulletMat:   THREE.MeshBasicMaterial;
  private readonly missileBody: THREE.CylinderGeometry;
  private readonly missileMat:  THREE.MeshBasicMaterial;
  private readonly missileGlow: THREE.SpriteMaterial;

  private shots:         EnemyShot[] = [];
  private cooldowns      = new Map<string, number>();
  private shootIntervals = new Map<string, number>();

  constructor(
    private scene:             THREE.Scene,
    private camera:            THREE.PerspectiveCamera,
    private cockpit:           Cockpit,
    private enemyManager:      EnemyManager,
    private projectileManager: ProjectileManager,
    private notifications:     NotificationSystem,
    private onRestartCallback?: () => void,
    private onExitCallback?:    () => void,
  ) {
    this.health = new HealthSystem(
      cockpit,
      () => {
        this.notifications.show({
          type:     'warn',
          title:    'تدمير الطائرة',
          msg:      'فقدان الأنظمة الحيوية. فشل المهمة.',
          duration: 8000,
        });
        // ✅ Play explosion sound when player dies
        this.sound.play('explosion', 1.0, 0.04);
      },
      onRestartCallback,
      onExitCallback,
    );

    this.bulletGeo  = new THREE.CylinderGeometry(2.5, 2.5, 28, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat  = new THREE.MeshBasicMaterial({ color: 0xff5500 });

    this.missileBody = new THREE.CylinderGeometry(5, 5, 70, 8);
    this.missileBody.rotateX(Math.PI / 2);
    this.missileMat  = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    this.missileGlow = new THREE.SpriteMaterial({
      color:       0xff4400,
      transparent: true,
      opacity:     0.55,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });
  }

  // ── Public API ────────────────────────────────────────────────

  public showHUD(): void {
    const root = document.getElementById('cs-hud-root');
    if (root) root.style.visibility = 'visible';
  }

  public hideHUD(): void {
    const root = document.getElementById('cs-hud-root');
    if (root) root.style.visibility = 'hidden';
  }

  public reset(): void {
    for (const s of this.shots) this.scene.remove(s.mesh);
    this.shots = [];
    this.cooldowns.clear();
    this.shootIntervals.clear();
    this.health.reset();
    this.showHUD();
  }

  public update(delta: number): void {
    this.health.update(delta);
    if (this.health.isDead) return;

    const cockpitPos = new THREE.Vector3();
    this.camera.getWorldPosition(cockpitPos);

    this.updateEnemyShooting(delta, cockpitPos);
    this.updateEnemyShots(delta, cockpitPos);
    this.projectileManager.checkHits(
      this.enemyManager.getEnemies(),
      this.ENEMY_HIT_R_BULLET,
      this.ENEMY_HIT_R_MISSILE,
      delta,
      (enemy, kind) => this.handleEnemyHit(enemy, kind),
    );
  }

  public dispose(): void {
    for (const s of this.shots) this.scene.remove(s.mesh);
    this.shots = [];
    this.bulletGeo.dispose();
    this.bulletMat.dispose();
    this.missileBody.dispose();
    this.missileMat.dispose();
    this.missileGlow.dispose();
    this.health.dispose();
  }

  // ── Enemy shooting AI ─────────────────────────────────────────

  private updateEnemyShooting(delta: number, cockpitPos: THREE.Vector3): void {
    for (const enemy of this.enemyManager.getEnemies()) {
      const dist = enemy.position.distanceTo(cockpitPos);
      if (dist > this.ENGAGE_DIST) continue;

      if (!this.cooldowns.has(enemy.uuid)) {
        const interval = this.randomInterval();
        this.cooldowns.set(enemy.uuid, interval * Math.random());
        this.shootIntervals.set(enemy.uuid, interval);
      }

      const cd = (this.cooldowns.get(enemy.uuid) ?? 0) - delta;
      this.cooldowns.set(enemy.uuid, cd);

      if (cd <= 0) {
        this.fireEnemyShot(enemy, cockpitPos, dist);
        const newInterval = this.randomInterval();
        this.cooldowns.set(enemy.uuid, newInterval);
        this.shootIntervals.set(enemy.uuid, newInterval);
      }
    }
  }

  private fireEnemyShot(
    enemy:     THREE.Object3D,
    targetPos: THREE.Vector3,
    dist:      number,
  ): void {
    const origin = enemy.position.clone();

    const travelTime     = dist / this.BULLET_SPEED;
    const playerFwd      = this.cockpit.model
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.cockpit.model.quaternion)
      : new THREE.Vector3();
    const speed          = this.cockpit.currentSpeed ?? 255;
    const playerVelocity = playerFwd.multiplyScalar(speed);
    const aimPos         = targetPos.clone().addScaledVector(playerVelocity, travelTime);

    aimPos.x += (Math.random() - 0.5) * dist * 0.02;

    const dir = aimPos.sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * 0.04;
    dir.y += (Math.random() - 0.5) * 0.04;
    dir.normalize();

    const isMissile = dist < 40_000 && Math.random() < 0.20;
    const mesh      = isMissile ? this.buildMissileMesh(dir) : this.buildBulletMesh(dir);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.shots.push({
      mesh,
      velocity: dir.clone().multiplyScalar(isMissile ? this.MISSILE_SPEED : this.BULLET_SPEED),
      life:     isMissile ? this.MISSILE_LIFE : this.BULLET_LIFE,
      isMissile,
      owner:    enemy,
    });
  }

  // ── Enemy shot visuals ────────────────────────────────────────

  private buildBulletMesh(dir: THREE.Vector3): THREE.Object3D {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.bulletGeo, this.bulletMat));

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xff7722, transparent: true, opacity: 0.70,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(18, 18, 1);
    group.add(glow);

    const tailGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 14), new THREE.Vector3(0, 0, 55),
    ]);
    group.add(new THREE.Line(tailGeo, new THREE.LineBasicMaterial({
      color: 0xff8844, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    return group;
  }

  private buildMissileMesh(dir: THREE.Vector3): THREE.Object3D {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.missileBody, this.missileMat));

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xff4400, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(50, 50, 1);
    group.add(glow);

    const exhaust = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffaa00, transparent: true, opacity: 0.40,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    exhaust.scale.set(22, 80, 1);
    exhaust.position.set(0, 0, 45);
    group.add(exhaust);

    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    return group;
  }

  // ── Update flying shots + hit player ─────────────────────────

  private updateEnemyShots(delta: number, cockpitPos: THREE.Vector3): void {
    const dead: EnemyShot[] = [];
    const t = Date.now() * 0.001;

    for (const s of this.shots) {
      s.life -= delta;
      if (s.life <= 0) { dead.push(s); continue; }

      s.mesh.position.addScaledVector(s.velocity, delta);
      s.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        s.velocity.clone().normalize(),
      );

      if (s.isMissile) {
        const fl      = 0.8 + 0.4 * Math.sin(t * 38);
        const exhaust = s.mesh.children[2] as THREE.Sprite | undefined;
        if (exhaust) {
          (exhaust.material as THREE.SpriteMaterial).opacity = 0.38 * fl;
          exhaust.scale.set(20 + fl * 4, 70 + fl * 30, 1);
        }
      }

      const dist = s.mesh.position.distanceTo(cockpitPos);
      const hitR  = s.isMissile ? this.HIT_R_MISSILE : this.HIT_R_BULLET;

      if (dist < hitR) {
        const dmg = s.isMissile ? this.MISSILE_DAMAGE : this.BULLET_DAMAGE;
        this.health.takeDamage(dmg);
        dead.push(s);

        // ✅ Play hit sound — missile is heavier than bullet
        if (s.isMissile) {
          this.sound.play('missile_hit', 0.9, 0.05);
        } else {
          this.sound.play('bullet_hit', 0.7, 0.12);
        }

        this.notifications.show({
          type:     'warn',
          title:    s.isMissile ? 'إصابة بصاروخ' : 'إصابة برصاص',
          msg:      s.isMissile
            ? 'صاروخ معادٍ أصاب الطائرة. تم رصد أضرار هيكلية.'
            : `إصابة مباشرة — سلامة الهيكل ${Math.round(this.health.hp)}%`,
          duration: 3000,
        });
      }
    }

    for (const s of dead) {
      this.scene.remove(s.mesh);
      this.shots = this.shots.filter(x => x !== s);
    }
  }

  // ── Player shots hitting enemies ──────────────────────────────

  private handleEnemyHit(enemy: THREE.Object3D, kind: 'bullet' | 'missile'): void {
    if (enemy.userData.isDead) return;
    if (enemy.userData.hp === undefined) enemy.userData.hp = 50;

    const dmg = kind === 'missile' ? this.PLAYER_MISSILE_DMG : this.PLAYER_BULLET_DMG;
    enemy.userData.hp -= dmg;

    this.flashEnemy(enemy, 0.15);

    if (enemy.userData.hp <= 0) {
      this.explodeAndRemove(enemy);
    }
  }

  // ── Enemy death ───────────────────────────────────────────────

  private explodeAndRemove(enemy: THREE.Object3D): void {
    this.spawnExplosion(enemy.position.clone());

    // ✅ Play explosion sound when enemy dies
    this.sound.play('explosion', 0.85, 0.08);

    const toRemove = this.shots.filter(s => s.owner === enemy);
    for (const s of toRemove) this.scene.remove(s.mesh);
    this.shots = this.shots.filter(s => s.owner !== enemy);
    this.cooldowns.delete(enemy.uuid);
    this.shootIntervals.delete(enemy.uuid);

    this.startDeathFall(enemy);

    this.notifications.show({
      type:     'kill',
      title:    'إسقاط هدف',
      msg:      'تم تدمير الطائرة المعادية وتقليل التهديد الجوي.',
      duration: 3500,
    });

    if ((window as any).missionController) {
      (window as any).missionController.onEnemyKilled();
    }
  }

  private startDeathFall(enemy: THREE.Object3D): void {
    enemy.userData.isDead = true;
    const FALL_DURATION   = 2.0;
    const FALL_SPEED      = 8_000;
    const SPIN_SPEED      = 2.5;
    let   elapsed         = 0;

    const tick = (delta: number) => {
      elapsed += delta;
      enemy.position.y -= FALL_SPEED * delta;
      enemy.rotation.z += SPIN_SPEED * delta;
      enemy.rotation.x += SPIN_SPEED * 0.5 * delta;
      enemy.scale.setScalar(Math.max(enemy.scale.x * (1 - 0.3 * delta), 0));
      if (elapsed / FALL_DURATION >= 1) {
        this.enemyManager.removeEnemy(enemy);
      } else {
        requestAnimationFrame(() => tick(1 / 60));
      }
    };
    requestAnimationFrame(() => tick(1 / 60));
  }

  private spawnExplosion(pos: THREE.Vector3): void {
    const layers = [
      { color: 0xffffff, size: 400,  opacity: 1.0, speed: 0.5 },
      { color: 0xffdd00, size: 700,  opacity: 0.9, speed: 0.7 },
      { color: 0xff6600, size: 900,  opacity: 0.8, speed: 0.9 },
      { color: 0xff2200, size: 600,  opacity: 0.7, speed: 1.1 },
      { color: 0x331100, size: 1100, opacity: 0.5, speed: 0.6 },
      { color: 0x888888, size: 800,  opacity: 0.3, speed: 0.4 },
    ];

    for (const layer of layers) {
      const mat = new THREE.SpriteMaterial({
        color:       layer.color,
        transparent: true,
        opacity:     layer.opacity,
        blending:    (layer.color === 0x331100 || layer.color === 0x888888)
                       ? THREE.NormalBlending : THREE.AdditiveBlending,
        depthWrite:  false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.setScalar(layer.size * 0.3);
      this.scene.add(sprite);

      const targetSize = layer.size;
      const duration   = 0.55 + layer.speed * 0.2;
      let   elapsed    = 0;

      const tick = () => {
        elapsed += 0.016;
        const t = elapsed / duration;
        if (t >= 1) { this.scene.remove(sprite); mat.dispose(); return; }
        sprite.scale.setScalar(targetSize * (1 - Math.pow(1 - t, 2)));
        mat.opacity = layer.opacity * (1 - t * t);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private flashEnemy(root: THREE.Object3D, duration: number): void {
    const end  = Date.now() + duration * 1000;
    const tick = () => {
      const remaining = (end - Date.now()) / 1000;
      if (remaining <= 0) {
        root.traverse(c => {
          const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (m?.emissive) { m.emissive.setScalar(0); m.emissiveIntensity = 0; }
        });
        return;
      }
      const intensity = remaining / duration;
      root.traverse(c => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m?.emissive) {
          m.emissive.setRGB(intensity, intensity * 0.25, 0);
          m.emissiveIntensity = intensity * 3;
        }
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private randomInterval(): number {
    return this.SHOOT_INTERVAL_MIN +
      Math.random() * (this.SHOOT_INTERVAL_MAX - this.SHOOT_INTERVAL_MIN);
  }
}