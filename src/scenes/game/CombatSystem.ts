import * as THREE from 'three';
import { Cockpit } from './Cockpit';
import { EnemyManager } from './EnemyManager';
import { ProjectileManager } from './ProjectileManager';
import { NotificationSystem } from './NotificationSystem';

// ───────────────────────────────────────────────────────────────
//  SoundSystem  — lightweight audio manager
// ───────────────────────────────────────────────────────────────
interface SoundClip {
  file: string;
  start: number;
  duration: number;
}

class SoundSystem {
  private ctx: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();

  private readonly clips: Record<string, SoundClip> = {
    bullet_hit: {
      file: '/sounds/foisal72-gun-fire-346766.mp3',
      start: 0.0,
      duration: 1.2,
    },
    missile_hit: {
      file: '/sounds/voicebosch-missile-explosion-168600.mp3',
      start: 0.0,
      duration: 1.5,
    },
    explosion: {
      file: '/sounds/dragon-studio-nuclear-explosion-386181.mp3',
      start: 0.0,
      duration: 1,
    },
  };

  constructor() {
    const resume = () => {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.loadAll();
      } else if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  private async loadAll(): Promise<void> {
    const fileMap = new Map<string, string>();
    for (const [key, clip] of Object.entries(this.clips)) {
      if (!fileMap.has(clip.file)) fileMap.set(clip.file, key);
    }

    const buffers = new Map<string, AudioBuffer>();
    for (const [file] of fileMap) {
      try {
        const res = await fetch(file);
        const arr = await res.arrayBuffer();
        const decoded = await this.ctx!.decodeAudioData(arr);
        buffers.set(file, decoded);
      } catch (e) {
        console.warn(`[SoundSystem] Could not load "${file}":`, e);
      }
    }

    for (const [key, clip] of Object.entries(this.clips)) {
      const buf = buffers.get(clip.file);
      if (buf) this.sounds.set(key, buf);
    }
  }

  public play(key: string, volume = 1.0, pitchVar = 0.08): void {
    if (!this.ctx || !this.sounds.has(key)) return;

    const clip = this.clips[key];
    const buf = this.sounds.get(key)!;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();

    source.buffer = buf;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchVar;
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(0, clip.start, clip.duration);
  }
}

// ───────────────────────────────────────────────────────────────
//  HealthSystem
// ───────────────────────────────────────────────────────────────
class HealthSystem {
  public hp = 100;
  public maxHp = 100;
  public isDead = false;

  public shakeTimer = 0;
  public shakeIntensity = 0;
  private readonly SHAKE_DURATION = 0.40;

  private cameraBasePos = new THREE.Vector3();
  private cameraBasePosSet = false;

  private hudFill: HTMLElement;
  private hudLabel: HTMLElement;
  private hudPct: HTMLElement;
  private hitOverlay: HTMLElement;
  private deathEl: HTMLElement;

  public onRestartCallback?: () => void;
  public onExitCallback?: () => void;

  constructor(
    private cockpit: Cockpit,
    private onDeathCallback?: () => void,
    onRestartCallback?: () => void,
    onExitCallback?: () => void,
  ) {
    this.onRestartCallback = onRestartCallback;
    this.onExitCallback = onExitCallback;
    this.buildHUD();
    this.hudFill = document.getElementById('cs-hp-fill')!;
    this.hudLabel = document.getElementById('cs-hp-label')!;
    this.hudPct = document.getElementById('cs-hp-pct')!;
    this.hitOverlay = document.getElementById('cs-hit-overlay')!;
    this.deathEl = document.getElementById('cs-death')!;
  }

  public takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.refreshBar();
    this.flashScreen();
    this.shakeTimer = this.SHAKE_DURATION;
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
    const t = Math.max(0, this.shakeTimer / this.SHAKE_DURATION);
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
    this.hp = this.maxHp;
    this.isDead = false;
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    this.cameraBasePosSet = false;
    this.refreshBar();
    this.deathEl.classList.remove('cs-visible');
    this.deathEl.style.visibility = 'hidden';
    this.deathEl.style.opacity = '0';
    this.deathEl.style.pointerEvents = 'none';
  }

  public dispose(): void {
    document.getElementById('cs-hud-root')?.remove();
  }

  private refreshBar(): void {
    const pct = this.hp / this.maxHp;
    const pctInt = Math.round(pct * 100);
    this.hudFill.style.width = `${pct * 100}%`;
    this.hudPct.textContent = `${pctInt}%`;
    if (pct > 0.5) {
      this.hudFill.style.background = '#556b2f';
      this.hudLabel.style.color = '#c9a84c';
      this.hudPct.style.color = '#c9a84c';
    } else if (pct > 0.25) {
      this.hudFill.style.background = '#7a6a1a';
      this.hudLabel.style.color = '#e8c84a';
      this.hudPct.style.color = '#e8c84a';
    } else {
      this.hudFill.style.background = '#8B1A1A';
      this.hudLabel.style.color = '#c9a84c';
      this.hudPct.style.color = '#ff6b6b';
    }
  }

  private flashScreen(): void {
    this.hitOverlay.style.opacity = '1';
    setTimeout(() => { this.hitOverlay.style.opacity = '0'; }, 100);
  }

  private onDeath(): void {
    if (this.isDead) return;

    this.isDead = true;
    this.hp = 0;
    this.refreshBar();

    this.shakeTimer = 3.0;
    this.shakeIntensity = 0.0006;

    this.deathEl.style.visibility = 'visible';
    this.deathEl.style.opacity = '0';
    this.deathEl.style.pointerEvents = 'all';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.deathEl.classList.add('cs-visible');
        this.deathEl.style.opacity = '1';
      });
    });

    setTimeout(() => {
      this.deathEl.style.visibility = 'visible';
      this.deathEl.style.opacity = '1';
      this.deathEl.style.pointerEvents = 'all';
      this.deathEl.classList.add('cs-visible');
    }, 120);

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
      #cs-hit-overlay {
        position: fixed; inset: 0; z-index: 9998;
        opacity: 0; transition: opacity .15s ease;
        background: radial-gradient(
          ellipse at center, transparent 40%, rgba(139,26,26,.45) 100%
        );
      }
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
//  Enemy projectile interface
// ───────────────────────────────────────────────────────────────
interface EnemyShot {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  life: number;
  isMissile: boolean;
  owner: THREE.Object3D;
}

// ───────────────────────────────────────────────────────────────
//  CombatSystem
// ───────────────────────────────────────────────────────────────
export class CombatSystem {
  public readonly health: HealthSystem;
  private readonly sound = new SoundSystem();
  private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

  private readonly ENGAGE_DIST = 120_000;
  private readonly BULLET_SPEED = 12_000;
  private readonly MISSILE_SPEED = 5_000;
  private readonly BULLET_LIFE = 10.0;
  private readonly MISSILE_LIFE = 12.0;
  private readonly BULLET_DAMAGE = 1;
  private readonly MISSILE_DAMAGE = 4;
  private readonly HIT_R_BULLET = 500;
  private readonly HIT_R_MISSILE = 500;
  private readonly SHOOT_INTERVAL_MIN = 2.0;
  private readonly SHOOT_INTERVAL_MAX = 5.0;

  private readonly PLAYER_BULLET_DMG = 25;
  private readonly PLAYER_MISSILE_DMG = 50;
  private readonly ENEMY_HIT_R_BULLET = 9000;
  private readonly ENEMY_HIT_R_MISSILE = 4000;

  private readonly bulletGeo: THREE.CylinderGeometry;
  private readonly bulletMat: THREE.MeshBasicMaterial;
  private readonly missileBody: THREE.CylinderGeometry;
  private readonly missileMat: THREE.MeshBasicMaterial;
  private readonly missileGlow: THREE.SpriteMaterial;

  private shots: EnemyShot[] = [];
  private cooldowns = new Map<string, number>();
  private shootIntervals = new Map<string, number>();

  // Cache for explosion textures
  private cachedTextures: Map<string, THREE.CanvasTexture> = new Map();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private cockpit: Cockpit,
    private enemyManager: EnemyManager,
    private projectileManager: ProjectileManager,
    private notifications: NotificationSystem,
    private onRestartCallback?: () => void,
    private onExitCallback?: () => void,
  ) {
    this.health = new HealthSystem(
      cockpit,
      () => {
        this.notifications.show({
          type: 'warn',
          title: 'تدمير الطائرة',
          msg: 'فقدان الأنظمة الحيوية. فشل المهمة.',
          duration: 8000,
        });
        this.sound.play('explosion', 1.0, 0.04);
      },
      onRestartCallback,
      onExitCallback,
    );

    this.bulletGeo = new THREE.CylinderGeometry(2.5, 2.5, 28, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });

    this.missileBody = new THREE.CylinderGeometry(5, 5, 70, 8);
    this.missileBody.rotateX(Math.PI / 2);
    this.missileMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    this.missileGlow = new THREE.SpriteMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
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
    
    // Dispose cached textures
    for (const texture of this.cachedTextures.values()) {
      texture.dispose();
    }
    this.cachedTextures.clear();
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
    enemy: THREE.Object3D,
    targetPos: THREE.Vector3,
    dist: number,
  ): void {
    const origin = enemy.position.clone();

    const travelTime = dist / this.BULLET_SPEED;
    const playerFwd = this.cockpit.model
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.cockpit.model.quaternion)
      : new THREE.Vector3();
    const speed = this.cockpit.currentSpeed ?? 255;
    const playerVelocity = playerFwd.multiplyScalar(speed);
    const aimPos = targetPos.clone().addScaledVector(playerVelocity, travelTime);

    aimPos.x += (Math.random() - 0.5) * dist * 0.02;

    const dir = aimPos.sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * 0.04;
    dir.y += (Math.random() - 0.5) * 0.04;
    dir.normalize();

    const isMissile = dist < 40_000 && Math.random() < 0.20;
    const mesh = isMissile ? this.buildMissileMesh(dir) : this.buildBulletMesh(dir);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.shots.push({
      mesh,
      velocity: dir.clone().multiplyScalar(isMissile ? this.MISSILE_SPEED : this.BULLET_SPEED),
      life: isMissile ? this.MISSILE_LIFE : this.BULLET_LIFE,
      isMissile,
      owner: enemy,
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
        const fl = 0.8 + 0.4 * Math.sin(t * 38);
        const exhaust = s.mesh.children[2] as THREE.Sprite | undefined;
        if (exhaust) {
          (exhaust.material as THREE.SpriteMaterial).opacity = 0.38 * fl;
          exhaust.scale.set(20 + fl * 4, 70 + fl * 30, 1);
        }
      }

      const dist = s.mesh.position.distanceTo(cockpitPos);
      const hitR = s.isMissile ? this.HIT_R_MISSILE : this.HIT_R_BULLET;

      if (dist < hitR) {
        const dmg = s.isMissile ? this.MISSILE_DAMAGE : this.BULLET_DAMAGE;
        this.health.takeDamage(dmg);
        dead.push(s);

        if (s.isMissile) {
          this.sound.play('missile_hit', 0.9, 0.05);
        } else {
          this.sound.play('bullet_hit', 0.7, 0.12);
        }

        this.notifications.show({
          type: 'warn',
          title: s.isMissile ? 'إصابة بصاروخ' : 'إصابة برصاص',
          msg: s.isMissile
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
    this.sound.play('explosion', 0.85, 0.08);

    const toRemove = this.shots.filter(s => s.owner === enemy);
    for (const s of toRemove) this.scene.remove(s.mesh);
    this.shots = this.shots.filter(s => s.owner !== enemy);
    this.cooldowns.delete(enemy.uuid);
    this.shootIntervals.delete(enemy.uuid);

    this.startDeathFall(enemy);

    this.notifications.show({
      type: 'kill',
      title: 'إسقاط هدف',
      msg: 'تم تدمير الطائرة المعادية وتقليل التهديد الجوي.',
      duration: 3500,
    });

    if ((window as any).missionController) {
      (window as any).missionController.onEnemyKilled();
    }
    if ((window as any).missionController2) {
      (window as any).missionController2.onEnemyKilled();
    }
  }

  private startDeathFall(enemy: THREE.Object3D): void {
    enemy.userData.isDead = true;

    // On mobile: skip the rAF death fall animation — just remove after a short delay
    if (this.isMobile) {
      setTimeout(() => this.enemyManager.removeEnemy(enemy), 500);
      return;
    }

    const FALL_DURATION = 2.0;
    const FALL_SPEED = 8_000;
    const SPIN_SPEED = 2.5;
    let elapsed = 0;

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
    // ══════════════════════════════════════════════════════════════
    // MOBILE: Ultra-simple explosion — NO requestAnimationFrame loops
    // Just 3 sprites + setTimeout removal. Zero rAF = zero crash risk.
    // ══════════════════════════════════════════════════════════════
    if (this.isMobile) {
      const flashTexture = this.getOrCreateTexture('flash', () => this.createFlashTexture());

      const layers = [
        { color: 0xffffff, size: 2000, opacity: 0.9, life: 300 },
        { color: 0xff8800, size: 4000, opacity: 0.7, life: 500 },
        { color: 0xff4400, size: 6000, opacity: 0.5, life: 700 },
      ];

      for (const layer of layers) {
        const mat = new THREE.SpriteMaterial({
          map: flashTexture,
          color: layer.color,
          transparent: true,
          opacity: layer.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.position.copy(pos);
        sprite.scale.setScalar(layer.size);
        this.scene.add(sprite);

        // Simple fade: reduce opacity once, then remove
        setTimeout(() => {
          mat.opacity = layer.opacity * 0.3;
        }, layer.life * 0.5);
        setTimeout(() => {
          this.scene.remove(sprite);
          mat.dispose();
        }, layer.life);
      }

      // Simple white flash overlay
      const whiteOverlay = document.createElement('div');
      Object.assign(whiteOverlay.style, {
        position: 'fixed', inset: '0', backgroundColor: 'white',
        pointerEvents: 'none', zIndex: '99999', opacity: '0.6',
        transition: 'opacity 0.15s ease',
      });
      document.body.appendChild(whiteOverlay);
      setTimeout(() => { whiteOverlay.style.opacity = '0'; }, 50);
      setTimeout(() => { whiteOverlay.remove(); }, 250);

      return;
    }

    // ══════════════════════════════════════════════════════════════
    // DESKTOP: Full cinematic explosion (unchanged — rAF loops OK on desktop)
    // ══════════════════════════════════════════════════════════════
  const flashTexture = this.getOrCreateTexture('flash', () => this.createFlashTexture());
  const smokeTexture = this.getOrCreateTexture('smoke', () => this.createSmokeTexture());
  const debrisTexture = this.getOrCreateTexture('debris', () => this.createDebrisTexture());

  // 🔥 MAIN FLASH
  const flashLayers = [
    { color: 0xffffff, size: 2500, opacity: 1.0, life: 0.18, scaleMulti: 8.0 },
    { color: 0xffcc88, size: 3800, opacity: 0.95, life: 0.25, scaleMulti: 9.0 },
    { color: 0xff8800, size: 5200, opacity: 0.85, life: 0.35, scaleMulti: 10.0 },
    { color: 0xff4400, size: 7000, opacity: 0.7, life: 0.48, scaleMulti: 11.0 },
    { color: 0xcc2200, size: 9000, opacity: 0.5, life: 0.65, scaleMulti: 12.0 },
    { color: 0xaa1100, size: 12000, opacity: 0.3, life: 0.85, scaleMulti: 13.0 },
  ];

  for (const layer of flashLayers) {
    const mat = new THREE.SpriteMaterial({
      map: flashTexture,
      color: layer.color,
      transparent: true,
      opacity: layer.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    const startScale = layer.size * 0.35;
    sprite.scale.setScalar(startScale);
    this.scene.add(sprite);

    let elapsed = 0;

    const tick = () => {
      elapsed += 0.016;
      const t = Math.min(elapsed / layer.life, 1);

      if (t >= 1) {
        this.scene.remove(sprite);
        mat.dispose();
        return;
      }

      const scaleMulti = 1 + t * (layer.scaleMulti - 1);
      sprite.scale.setScalar(startScale * scaleMulti);
      mat.opacity = layer.opacity * (1 - Math.pow(t, 1.5));
      sprite.position.y += 45 * (1 - t);

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  // 💨 SMOKE
  const smokeLayers = [
    { color: 0x2a1a0a, size: 4000, opacity: 0.65, life: 1.5, riseSpeed: 6.0, drift: 2.5, count: 5 },
    { color: 0x4a3a2a, size: 6000, opacity: 0.55, life: 2.0, riseSpeed: 5.0, drift: 2.0, count: 5 },
    { color: 0x6a5a4a, size: 8500, opacity: 0.45, life: 2.6, riseSpeed: 4.0, drift: 1.5, count: 5 },
    { color: 0x8a7a6a, size: 11000, opacity: 0.35, life: 3.2, riseSpeed: 3.0, drift: 1.2, count: 5 },
    { color: 0xaa9a8a, size: 14000, opacity: 0.25, life: 4.0, riseSpeed: 2.0, drift: 0.8, count: 4 },
  ];

  for (const layer of smokeLayers) {
    for (let s = 0; s < layer.count; s++) {
      const mat = new THREE.SpriteMaterial({
        map: smokeTexture,
        color: layer.color,
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() - 0.5) * 1200;
      const offsetX = Math.cos(angle) * radius;
      const offsetZ = Math.sin(angle) * radius;
      
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos.clone().add(new THREE.Vector3(offsetX, Math.random() * 300, offsetZ)));
      sprite.scale.setScalar(layer.size * 0.15 * (0.5 + Math.random() * 1.0));
      this.scene.add(sprite);

      let elapsed = 0;
      const driftX = (Math.random() - 0.5) * layer.drift * 2.0;
      const driftZ = (Math.random() - 0.5) * layer.drift * 2.0;
      const rotationSpeed = (Math.random() - 0.5) * 0.12;

      const tick = () => {
        elapsed += 0.016;
        const t = Math.min(elapsed / layer.life, 1);

        if (t >= 1) {
          this.scene.remove(sprite);
          mat.dispose();
          return;
        }

        const scaleFactor = 0.2 + t * 3.5;
        sprite.scale.setScalar(layer.size * 0.15 * scaleFactor);
        sprite.position.y += layer.riseSpeed * (1 - t * 0.4);
        sprite.position.x += driftX * (0.2 + t);
        sprite.position.z += driftZ * (0.2 + t);
        sprite.position.x += Math.sin(elapsed * 5) * 2.5;
        sprite.position.z += Math.cos(elapsed * 4) * 2.5;
        sprite.material.rotation += rotationSpeed;
        mat.opacity = layer.opacity * (1 - Math.pow(t, 1.4));

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    }
  }

  // 🔥 FIREBALL PARTICLES
  const fireParticleCount = 180;
  for (let i = 0; i < fireParticleCount; i++) {
    const mat = new THREE.SpriteMaterial({
      map: flashTexture,
      color: i < fireParticleCount * 0.5 ? 0xffaa44 : 0xff4422,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    
    const angle = Math.random() * Math.PI * 2;
    const elevation = Math.random() * Math.PI - Math.PI / 2;
    const speed = 180 + Math.random() * 220;
    const vel = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elevation) * speed,
      Math.sin(elevation) * speed + 120,
      Math.sin(angle) * Math.cos(elevation) * speed
    );
    
    sprite.scale.setScalar(25 + Math.random() * 45);
    this.scene.add(sprite);

    let life = 0;
    const maxLife = 0.6 + Math.random() * 0.4;

    const tick = () => {
      life += 0.016;
      const t = life / maxLife;

      if (t >= 1) {
        this.scene.remove(sprite);
        mat.dispose();
        return;
      }

      sprite.position.addScaledVector(vel, 0.016);
      vel.y -= 25;
      vel.multiplyScalar(0.96);
      
      const scaleFactor = 1 - t * 0.25;
      sprite.scale.setScalar((25 + Math.random() * 45) * scaleFactor);
      mat.opacity = 0.95 * (1 - Math.pow(t, 1.6));

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  // 💥 SHOCKWAVE RINGS
  const ringCount = 3;
  for (let r = 0; r < ringCount; r++) {
    const ringGeo = new THREE.RingGeometry(30 + r * 20, 80 + r * 30, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: r === 0 ? 0xffaa66 : (r === 1 ? 0xff8844 : 0xff6622),
      transparent: true,
      opacity: 0.85 - r * 0.15,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.position.y += 40 + r * 15;
    ring.lookAt(0, 1, 0);
    this.scene.add(ring);
    
    let ringLife = 0;
    const ringDelay = r * 0.05;
    let started = false;
    
    const ringTick = () => {
      if (!started) {
        ringLife += 0.016;
        if (ringLife >= ringDelay) {
          started = true;
          ringLife = 0;
        } else {
          requestAnimationFrame(ringTick);
          return;
        }
      }
      
      ringLife += 0.016;
      const t = ringLife / (0.4 + r * 0.1);
      
      if (t >= 1) {
        this.scene.remove(ring);
        ringGeo.dispose();
        ringMat.dispose();
        return;
      }
      
      const scale = 1 + t * 20;
      ring.scale.setScalar(scale);
      ringMat.opacity = (0.85 - r * 0.15) * (1 - Math.pow(t, 1.4));
      
      requestAnimationFrame(ringTick);
    };
    requestAnimationFrame(ringTick);
  }

  // 💨 DEBRIS PARTICLES
  const debrisCount = 120;
  for (let i = 0; i < debrisCount; i++) {
    const mat = new THREE.SpriteMaterial({
      map: debrisTexture,
      color: 0xccaa88,
      transparent: true,
      opacity: 0.9,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    
    const angle = Math.random() * Math.PI * 2;
    const elevation = Math.random() * Math.PI - Math.PI / 2;
    const speed = 100 + Math.random() * 180;
    const vel = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elevation) * speed,
      Math.sin(elevation) * speed + 80,
      Math.sin(angle) * Math.cos(elevation) * speed
    );
    
    sprite.scale.setScalar(12 + Math.random() * 28);
    this.scene.add(sprite);

    let life = 0;
    const maxLife = 1.2 + Math.random() * 1.0;
    let rotation = Math.random() * Math.PI * 2;
    const rotSpeed = (Math.random() - 0.5) * 0.6;

    const tick = () => {
      life += 0.016;
      const t = life / maxLife;

      if (t >= 1) {
        this.scene.remove(sprite);
        mat.dispose();
        return;
      }

      sprite.position.addScaledVector(vel, 0.016);
      vel.y -= 28;
      vel.multiplyScalar(0.97);
      
      rotation += rotSpeed;
      sprite.material.rotation = rotation;
      
      const scaleFactor = 1 - t * 0.5;
      sprite.scale.setScalar((12 + Math.random() * 28) * scaleFactor);
      mat.opacity = 0.9 * (1 - t);

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  // 🌟 SCREEN SHAKE
  if (this.camera) {
    const originalPos = this.camera.position.clone();
    let shakeTime = 0;
    const shakeDuration = 0.6;
    
    const shakeTick = () => {
      shakeTime += 0.016;
      const t = shakeTime / shakeDuration;
      
      if (t >= 1) {
        this.camera.position.copy(originalPos);
        return;
      }
      
      const intensity = (1 - t) * 35;
      this.camera.position.x = originalPos.x + (Math.random() - 0.5) * intensity;
      this.camera.position.y = originalPos.y + (Math.random() - 0.5) * intensity * 1.2;
      this.camera.position.z = originalPos.z + (Math.random() - 0.5) * intensity * 0.7;
      
      requestAnimationFrame(shakeTick);
    };
    
    requestAnimationFrame(shakeTick);
  }

  // 💥 WHITE FLASH OVERLAY
  const whiteOverlay = document.createElement('div');
  whiteOverlay.style.position = 'fixed';
  whiteOverlay.style.top = '0';
  whiteOverlay.style.left = '0';
  whiteOverlay.style.width = '100%';
  whiteOverlay.style.height = '100%';
  whiteOverlay.style.backgroundColor = 'white';
  whiteOverlay.style.pointerEvents = 'none';
  whiteOverlay.style.zIndex = '99999';
  whiteOverlay.style.opacity = '0';
  whiteOverlay.style.transition = 'opacity 0.05s ease-out';
  document.body.appendChild(whiteOverlay);
  
  setTimeout(() => {
    whiteOverlay.style.opacity = '0.85';
    setTimeout(() => {
      whiteOverlay.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(whiteOverlay);
      }, 150);
    }, 60);
  }, 0);

  // 🌋 MUSHROOM CLOUD STEM
  const stemCount = 30;
  for (let i = 0; i < stemCount; i++) {
    const mat = new THREE.SpriteMaterial({
      map: flashTexture,
      color: 0xff6644,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });

    const sprite = new THREE.Sprite(mat);
    const angle = Math.random() * Math.PI * 2;
    const radius = (Math.random() - 0.5) * 600;
    sprite.position.copy(pos.clone().add(new THREE.Vector3(
      Math.cos(angle) * radius,
      Math.random() * 200,
      Math.sin(angle) * radius
    )));
    sprite.scale.setScalar(80 + Math.random() * 120);
    this.scene.add(sprite);

    let elapsed = 0;
    const life = 0.8;
    const riseSpeed = 45 + Math.random() * 35;

    const tick = () => {
      elapsed += 0.016;
      const t = elapsed / life;

      if (t >= 1) {
        this.scene.remove(sprite);
        mat.dispose();
        return;
      }

      sprite.position.y += riseSpeed * (1 - t * 0.5);
      sprite.scale.setScalar((80 + Math.random() * 120) * (1 + t * 0.8));
      mat.opacity = 0.7 * (1 - Math.pow(t, 1.3));

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }
}

  // ── TEXTURE GENERATION HELPERS ─────────────────────────────────

  private getOrCreateTexture(key: string, creator: () => THREE.CanvasTexture): THREE.CanvasTexture {
    if (!this.cachedTextures.has(key)) {
      this.cachedTextures.set(key, creator());
    }
    return this.cachedTextures.get(key)!;
  }

  private createFlashTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 64, 64);

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.9)');
    gradient.addColorStop(0.6, 'rgba(255, 100, 0, 0.6)');
    gradient.addColorStop(0.8, 'rgba(255, 50, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 64;
      const y = Math.random() * 64;
      const alpha = Math.random() * 0.3;
      const dist = Math.hypot(x - 32, y - 32);
      if (dist < 32) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createSmokeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    for (let i = 0; i < 8; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const offsetY = (Math.random() - 0.5) * 40;
      const radius = 30 + Math.random() * 25;

      const gradient = ctx.createRadialGradient(
        64 + offsetX, 64 + offsetY, 0,
        64 + offsetX, 64 + offsetY, radius
      );
      gradient.addColorStop(0, `rgba(100, 100, 100, ${0.3 + Math.random() * 0.2})`);
      gradient.addColorStop(0.5, `rgba(80, 80, 80, ${0.15 + Math.random() * 0.1})`);
      gradient.addColorStop(1, 'rgba(60, 60, 60, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createDebrisTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 16, 16);

    ctx.fillStyle = 'rgba(80, 60, 40, 0.9)';
    ctx.fillRect(4, 4, 8, 3);
    ctx.fillRect(6, 7, 5, 4);
    ctx.fillRect(3, 10, 7, 3);

    ctx.fillStyle = 'rgba(120, 80, 50, 0.7)';
    ctx.fillRect(5, 5, 4, 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // ── Helpers ───────────────────────────────────────────────────

  private flashEnemy(root: THREE.Object3D, duration: number): void {
    // On mobile: simple one-shot flash — no rAF loop
    if (this.isMobile) {
      root.traverse(c => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m?.emissive) {
          m.emissive.setRGB(1, 0.25, 0);
          m.emissiveIntensity = 3;
        }
      });
      setTimeout(() => {
        root.traverse(c => {
          const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (m?.emissive) { m.emissive.setScalar(0); m.emissiveIntensity = 0; }
        });
      }, duration * 1000);
      return;
    }

    const end = Date.now() + duration * 1000;
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