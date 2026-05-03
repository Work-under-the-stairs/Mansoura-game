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
//  Managed particle — driven by update(delta), zero rAF
// ───────────────────────────────────────────────────────────────
interface ManagedParticle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  // flat velocity scalars — no Vector3 object allocation
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScaleMulti: number;  // sprite.scale = startScale * lerp(1, endScaleMulti, t)
  kind: 'flash' | 'smoke' | 'debris' | 'fire' | 'stem';
  rotSpeed: number;
}

// Falling enemy entry — replaces the rAF-based startDeathFall
interface FallingEnemy {
  obj: THREE.Object3D;
  elapsed: number;
}

// ───────────────────────────────────────────────────────────────
//  Shared canvas textures — created once, reused forever
// ───────────────────────────────────────────────────────────────
let _flashTex:  THREE.CanvasTexture | null = null;
let _smokeTex:  THREE.CanvasTexture | null = null;
let _debrisTex: THREE.CanvasTexture | null = null;

function getFlashTexture(): THREE.CanvasTexture {
  if (_flashTex) return _flashTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,200,100,0.9)');
  g.addColorStop(0.6, 'rgba(255,100,0,0.6)');
  g.addColorStop(0.8, 'rgba(255,50,0,0.2)');
  g.addColorStop(1,   'rgba(255,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _flashTex = new THREE.CanvasTexture(canvas);
  _flashTex.needsUpdate = true;
  return _flashTex;
}

function getSmokeTexture(): THREE.CanvasTexture {
  if (_smokeTex) return _smokeTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const ox = (Math.random() - 0.5) * 40, oy = (Math.random() - 0.5) * 40;
    const r = 30 + Math.random() * 25;
    const gr = ctx.createRadialGradient(64+ox, 64+oy, 0, 64+ox, 64+oy, r);
    gr.addColorStop(0,   `rgba(100,100,100,${0.3 + Math.random() * 0.2})`);
    gr.addColorStop(0.5, `rgba(80,80,80,${0.15 + Math.random() * 0.1})`);
    gr.addColorStop(1,   'rgba(60,60,60,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
  }
  _smokeTex = new THREE.CanvasTexture(canvas);
  _smokeTex.needsUpdate = true;
  return _smokeTex;
}

function getDebrisTexture(): THREE.CanvasTexture {
  if (_debrisTex) return _debrisTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(80,60,40,0.9)';
  ctx.fillRect(4,4,8,3); ctx.fillRect(6,7,5,4); ctx.fillRect(3,10,7,3);
  ctx.fillStyle = 'rgba(120,80,50,0.7)';
  ctx.fillRect(5,5,4,2);
  _debrisTex = new THREE.CanvasTexture(canvas);
  _debrisTex.needsUpdate = true;
  return _debrisTex;
}

// ───────────────────────────────────────────────────────────────
//  CombatSystem
// ───────────────────────────────────────────────────────────────
export class CombatSystem {
  public readonly health: HealthSystem;
  private readonly sound = new SoundSystem();

  private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || navigator.maxTouchPoints > 1;

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

  private shots: EnemyShot[] = [];
  private cooldowns = new Map<string, number>();
  private shootIntervals = new Map<string, number>();

  // ✅ Managed particle pool — updated every frame via update(delta), zero rAF
  private particles: ManagedParticle[] = [];

  // ✅ Falling enemies — updated every frame, no rAF
  private fallingEnemies: FallingEnemy[] = [];

  // ✅ Shockwave rings — updated every frame, no rAF
  private shockwaveRings: Array<{
    mesh: THREE.Mesh;
    geo: THREE.RingGeometry;
    mat: THREE.MeshBasicMaterial;
    life: number;
    maxLife: number;
    startY: number;
  }> = [];

  // Particle budget by device
  private readonly FLASH_COUNT:  number;
  private readonly FIRE_COUNT:   number;
  private readonly SMOKE_COUNT:  number;
  private readonly DEBRIS_COUNT: number;
  private readonly STEM_COUNT:   number;

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
    // ✅ Drastically lower counts on mobile — desktop keeps the spectacle
    this.FLASH_COUNT  = this.isMobile ? 3  : 6;
    this.FIRE_COUNT   = this.isMobile ? 20 : 120;
    this.SMOKE_COUNT  = this.isMobile ? 8  : 25;
    this.DEBRIS_COUNT = this.isMobile ? 15 : 80;
    this.STEM_COUNT   = this.isMobile ? 5  : 20;

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

    // Clear all managed particles
    for (const p of this.particles) {
      this.scene.remove(p.sprite);
      p.mat.dispose();
    }
    this.particles = [];

    // Clear falling enemies
    for (const fe of this.fallingEnemies) {
      this.enemyManager.removeEnemy(fe.obj);
    }
    this.fallingEnemies = [];

    // Clear shockwave rings
    for (const r of this.shockwaveRings) {
      this.scene.remove(r.mesh);
      r.geo.dispose();
      r.mat.dispose();
    }
    this.shockwaveRings = [];

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

    // ✅ All particle/physics updates driven here — zero extra rAF loops
    this.updateParticles(delta);
    this.updateShockwaveRings(delta);
    this.updateFallingEnemies(delta);

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

    for (const p of this.particles) {
      this.scene.remove(p.sprite);
      p.mat.dispose();
    }
    this.particles = [];

    for (const r of this.shockwaveRings) {
      this.scene.remove(r.mesh);
      r.geo.dispose();
      r.mat.dispose();
    }
    this.shockwaveRings = [];

    this.bulletGeo.dispose();
    this.bulletMat.dispose();
    this.missileBody.dispose();
    this.missileMat.dispose();
    this.health.dispose();

    // Dispose shared textures
    _flashTex?.dispose();  _flashTex  = null;
    _smokeTex?.dispose();  _smokeTex  = null;
    _debrisTex?.dispose(); _debrisTex = null;
  }

  // ── Particle pool update — the ONLY place particles move ─────

  private updateParticles(delta: number): void {
    let i = this.particles.length;
    while (i--) {
      const p = this.particles[i];
      p.life -= delta;

      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      const t = 1 - p.life / p.maxLife; // 0 = born, 1 = dead

      // Move
      p.sprite.position.x += p.vx * delta;
      p.sprite.position.y += p.vy * delta;
      p.sprite.position.z += p.vz * delta;

      // Apply gravity to fire and debris
      if (p.kind === 'fire' || p.kind === 'debris') {
        p.vy -= 25 * delta;
      }

      // Scale
      const scale = p.startScale * (1 + t * (p.endScaleMulti - 1));
      p.sprite.scale.setScalar(scale);

      // Rotation for smoke/debris
      if (p.rotSpeed !== 0) {
        p.mat.rotation += p.rotSpeed * delta;
      }

      // Opacity curves per kind
      switch (p.kind) {
        case 'flash':
        case 'stem':
          p.mat.opacity = Math.max(0, 1 - Math.pow(t, 1.5));
          break;
        case 'fire':
          p.mat.opacity = Math.max(0, 0.95 * (1 - Math.pow(t, 1.6)));
          break;
        case 'smoke':
          p.mat.opacity = Math.max(0, p.mat.opacity * 1); // handled via startOpacity stored in maxLife trick
          // Simple fade out for smoke
          p.mat.opacity = Math.max(0, 0.55 * (1 - Math.pow(t, 1.4)));
          break;
        case 'debris':
          p.mat.opacity = Math.max(0, 0.9 * (1 - t));
          break;
      }
    }
  }

  // ── Shockwave rings — updated per frame, no rAF ──────────────

  private updateShockwaveRings(delta: number): void {
    let i = this.shockwaveRings.length;
    while (i--) {
      const r = this.shockwaveRings[i];
      r.life -= delta;
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.geo.dispose();
        r.mat.dispose();
        this.shockwaveRings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      const scale = 1 + t * 20;
      r.mesh.scale.setScalar(scale);
      r.mat.opacity = Math.max(0, 0.75 * (1 - Math.pow(t, 1.4)));
    }
  }

  // ── Falling enemies — updated per frame, no rAF ──────────────

  private updateFallingEnemies(delta: number): void {
    const FALL_DURATION = 2.0;
    const FALL_SPEED    = 8_000;
    const SPIN_SPEED    = 2.5;

    let i = this.fallingEnemies.length;
    while (i--) {
      const fe = this.fallingEnemies[i];
      fe.elapsed += delta;
      fe.obj.position.y     -= FALL_SPEED * delta;
      fe.obj.rotation.z     += SPIN_SPEED * delta;
      fe.obj.rotation.x     += SPIN_SPEED * 0.5 * delta;
      fe.obj.scale.setScalar(Math.max(fe.obj.scale.x * (1 - 0.3 * delta), 0));

      if (fe.elapsed >= FALL_DURATION) {
        this.enemyManager.removeEnemy(fe.obj);
        this.fallingEnemies.splice(i, 1);
      }
    }
  }

  // ── Helper: add a particle to the managed pool ───────────────

  private addParticle(
    kind:           ManagedParticle['kind'],
    tex:            THREE.Texture,
    color:          number,
    opacity:        number,
    blending:       THREE.Blending,
    pos:            THREE.Vector3,
    scale:          number,
    endScaleMulti:  number,
    life:           number,
    vx: number, vy: number, vz: number,
    rotSpeed = 0,
  ): void {
    // Hard cap — prevent runaway accumulation on mobile
    const MAX_PARTICLES = this.isMobile ? 80 : 600;
    if (this.particles.length >= MAX_PARTICLES) return;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      color,
      transparent: true,
      opacity,
      blending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.setScalar(scale);
    this.scene.add(sprite);

    this.particles.push({ sprite, mat, vx, vy, vz, life, maxLife: life, startScale: scale, endScaleMulti, kind, rotSpeed });
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

    // ✅ Use managed falling instead of rAF-based tick
    enemy.userData.isDead = true;
    this.fallingEnemies.push({ obj: enemy, elapsed: 0 });

    this.notifications.show({
      type: 'kill',
      title: 'إسقاط هدف',
      msg: 'تم تدمير الطائرة المعادية وتقليل التهديد الجوي.',
      duration: 3500,
    });

    if ((window as any).missionController) {
      (window as any).missionController.onEnemyKilled();
    }
  }

  // ── EXPLOSION — all particles pushed to managed pool ─────────

  private spawnExplosion(pos: THREE.Vector3): void {
    const flashTex  = getFlashTexture();
    const smokeTex  = getSmokeTexture();
    const debrisTex = getDebrisTexture();

    // ── Flash layers
    const flashColors = [0xffffff, 0xffcc88, 0xff8800, 0xff4400, 0xcc2200];
    const flashSizes  = [800, 1200, 1800, 2400, 3200];
    const flashLives  = [0.18, 0.25, 0.35, 0.48, 0.65];
    const count = Math.min(this.FLASH_COUNT, flashColors.length);
    for (let i = 0; i < count; i++) {
      this.addParticle(
        'flash', flashTex, flashColors[i], 1.0,
        THREE.AdditiveBlending,
        pos.clone().add(new THREE.Vector3(0, i * 12, 0)),
        flashSizes[i] * 0.12,
        8 + i * 1.5,
        flashLives[i],
        0, 40 * (1 - i * 0.1), 0,
      );
    }

    // ── Fire particles
    for (let i = 0; i < this.FIRE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elev  = Math.random() * Math.PI - Math.PI / 2;
      const spd   = 150 + Math.random() * 200;
      this.addParticle(
        'fire', flashTex,
        i < this.FIRE_COUNT * 0.5 ? 0xffaa44 : 0xff4422,
        0.95, THREE.AdditiveBlending,
        pos.clone(),
        20 + Math.random() * 40,
        0.6,
        0.5 + Math.random() * 0.4,
        Math.cos(angle) * Math.cos(elev) * spd,
        Math.sin(elev) * spd + 100,
        Math.sin(angle) * Math.cos(elev) * spd,
      );
    }

    // ── Smoke layers
    for (let i = 0; i < this.SMOKE_COUNT; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = (Math.random() - 0.5) * 800;
      const smokePos = pos.clone().add(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.random() * 200,
        Math.sin(angle) * radius,
      ));
      const smokeSize  = 600 + Math.random() * 1400;
      const smokeLife  = 1.2 + Math.random() * 2.0;
      this.addParticle(
        'smoke', smokeTex,
        0x3a2a1a, 0.55,
        THREE.NormalBlending,
        smokePos,
        smokeSize * 0.08,
        4.0,
        smokeLife,
        (Math.random() - 0.5) * 20,
        30 + Math.random() * 40,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 0.1,
      );
    }

    // ── Debris
    for (let i = 0; i < this.DEBRIS_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const elev  = Math.random() * Math.PI - Math.PI / 2;
      const spd   = 80 + Math.random() * 150;
      this.addParticle(
        'debris', debrisTex, 0xccaa88, 0.9,
        THREE.NormalBlending,
        pos.clone(),
        10 + Math.random() * 22,
        0.4,
        1.0 + Math.random() * 1.0,
        Math.cos(angle) * Math.cos(elev) * spd,
        Math.sin(elev) * spd + 60,
        Math.sin(angle) * Math.cos(elev) * spd,
        (Math.random() - 0.5) * 0.5,
      );
    }

    // ── Stem (mushroom column)
    for (let i = 0; i < this.STEM_COUNT; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = (Math.random() - 0.5) * 500;
      this.addParticle(
        'stem', flashTex, 0xff6644, 0.7,
        THREE.AdditiveBlending,
        pos.clone().add(new THREE.Vector3(
          Math.cos(angle) * radius, Math.random() * 150, Math.sin(angle) * radius,
        )),
        80 + Math.random() * 100,
        2.0,
        0.7 + Math.random() * 0.3,
        (Math.random() - 0.5) * 10,
        40 + Math.random() * 30,
        (Math.random() - 0.5) * 10,
      );
    }

    // ── Shockwave rings (pushed to managed list, not rAF)
    if (!this.isMobile) {
      for (let r = 0; r < 3; r++) {
        const geo = new THREE.RingGeometry(30 + r * 20, 80 + r * 30, 48);
        const mat = new THREE.MeshBasicMaterial({
          color: r === 0 ? 0xffaa66 : r === 1 ? 0xff8844 : 0xff6622,
          transparent: true,
          opacity: 0.75 - r * 0.15,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.position.y += 40 + r * 15;
        mesh.lookAt(pos.x, pos.y + 1, pos.z);
        this.scene.add(mesh);
        const life = 0.4 + r * 0.1;
        this.shockwaveRings.push({ mesh, geo, mat, life, maxLife: life, startY: mesh.position.y });
      }
    }

    // ── White flash overlay (DOM) — only on desktop, single element, no leak
    if (!this.isMobile) {
      const whiteOverlay = document.createElement('div');
      Object.assign(whiteOverlay.style, {
        position:        'fixed',
        inset:           '0',
        backgroundColor: 'white',
        pointerEvents:   'none',
        zIndex:          '99999',
        opacity:         '0',
        transition:      'opacity 0.05s ease-out',
      });
      document.body.appendChild(whiteOverlay);

      // Animate with setTimeout — short-lived, no rAF leak
      setTimeout(() => { whiteOverlay.style.opacity = '0.7'; }, 0);
      setTimeout(() => { whiteOverlay.style.opacity = '0'; },   60);
      setTimeout(() => { whiteOverlay.remove(); },               220);
    }

    // ── Screen shake — delegate entirely to HealthSystem shaker
    // (HealthSystem.update already runs every frame via this.health.update)
    // Just bump the shakeTimer for the explosion magnitude
    this.health.shakeTimer    = Math.max(this.health.shakeTimer, 0.5);
    this.health.shakeIntensity = Math.max(this.health.shakeIntensity, 0.0004);
  }

  // ── Helpers ───────────────────────────────────────────────────

  private flashEnemy(root: THREE.Object3D, duration: number): void {
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