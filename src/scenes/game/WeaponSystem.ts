import * as THREE from 'three';
import { Controls } from './Controls';
import { ProjectileManager } from './ProjectileManager';

// ─────────────────────────────────────────────
//  SoundSystem — clip-based Web Audio player
// ─────────────────────────────────────────────
interface SoundClip {
  file:     string;
  start:    number;   // seconds into the file to begin
  duration: number;   // how many seconds to play
}

class SoundSystem {
  private ctx:    AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();

  // ═══════════════════════════════════════════════════════════
  //  ✅ CONFIGURE YOUR WEAPON SOUNDS HERE
  //  file     → path inside /public/
  //  start    → where in the file to start (seconds)
  //  duration → how long to play (seconds)
  // ═══════════════════════════════════════════════════════════
  private readonly clips: Record<string, SoundClip> = {
    bullet_fire: {
      file:     '/sounds/foisal72-gun-fire-346766.mp3',
      start:    0.0,   // ← change this  e.g. 1.2
      duration: 1.2,   // ← change this  e.g. 0.4
    },
    missile_fire: {
      file:     '/sounds/voicebosch-missile-explosion-168600.mp3',
      start:    0.0,   // ← change this  e.g. 3.8
      duration: 1.5,   // ← change this  e.g. 0.8
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
    const fileSet = new Set(Object.values(this.clips).map(c => c.file));
    const buffers = new Map<string, AudioBuffer>();

    for (const file of fileSet) {
      try {
        const res     = await fetch(file);
        const arr     = await res.arrayBuffer();
        const decoded = await this.ctx!.decodeAudioData(arr);
        buffers.set(file, decoded);
      } catch (e) {
        console.warn(`[WeaponSound] Could not load "${file}":`, e);
      }
    }

    for (const [key, clip] of Object.entries(this.clips)) {
      const buf = buffers.get(clip.file);
      if (buf) this.sounds.set(key, buf);
    }
  }

  /**
   * Play a clip by key.
   * @param key      'bullet_fire' | 'missile_fire'
   * @param volume   0–1
   * @param pitchVar random pitch variation ± fraction (0 = no variation)
   */
  public play(key: string, volume = 1.0, pitchVar = 0.05): void {
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

    // ✅ Plays only from clip.start for clip.duration seconds
    source.start(0, clip.start, clip.duration);
  }
}

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────
interface WeaponConfig {
  bulletFireRate:  number;
  missileFireRate: number;
  maxBullets:      number;
}

const DEFAULT_CONFIG: WeaponConfig = {
  bulletFireRate:  18,
  missileFireRate: 0.7,
  maxBullets:      10350,
};

const GUN_BARRELS: THREE.Vector3[] = [
  new THREE.Vector3(10, -7, -50),
  new THREE.Vector3(9.8, -6.8, -50),
];

const MISSILE_HARDPOINT = new THREE.Vector3(-10, -10, -60);

// ─────────────────────────────────────────────
//  Muzzle flash — layered for realism
// ─────────────────────────────────────────────
interface MuzzleFlash {
  group:     THREE.Group;
  core:      THREE.Sprite;
  primary:   THREE.Sprite;
  secondary: THREE.Sprite;
}

function makeMuzzleFlash(scene: THREE.Group, barrelPos: THREE.Vector3): MuzzleFlash {
  const group = new THREE.Group();
  group.position.copy(barrelPos);

  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.scale.set(1.8, 1.8, 1);
  core.name = 'core';
  group.add(core);

  const primary = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffcc44, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  primary.scale.set(2.2, 3.8, 1);
  primary.position.set(0, 0, -1.5);
  primary.name = 'primary';
  group.add(primary);

  const secondary = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xff8800, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  secondary.scale.set(5.5, 5.5, 1);
  secondary.name = 'secondary';
  group.add(secondary);

  scene.add(group);
  return { group, core, primary, secondary };
}

// ─────────────────────────────────────────────
//  WeaponSystem
// ─────────────────────────────────────────────
export class WeaponSystem {
  public bulletsLeft: number;
  public readonly missilesLeft = Infinity;

  private bulletCooldown  = 0;
  private missileCooldown = 0;
  private barrelIndex     = 0;

  private muzzleFlashes: MuzzleFlash[] = [];
  private flashTimers:   number[]      = [];

  private readonly FLASH_DURATION = 0.038;

  private config: WeaponConfig;

  // ✅ Weapon sound system
  private readonly sound = new SoundSystem();

  constructor(
    private scene:             THREE.Scene,
    private cockpitModel:      THREE.Group,
    private controls:          Controls,
    private projectileManager: ProjectileManager,
    config: Partial<WeaponConfig> = {},
  ) {
    this.config      = { ...DEFAULT_CONFIG, ...config };
    this.bulletsLeft = this.config.maxBullets;
    this.initMuzzleFlashes();
  }

  // ── INIT ──────────────────────────────────────────────────────

  private initMuzzleFlashes(): void {
    for (let i = 0; i < GUN_BARRELS.length; i++) {
      const flash = makeMuzzleFlash(this.cockpitModel, GUN_BARRELS[i]);
      this.muzzleFlashes.push(flash);
      this.flashTimers.push(0);
    }
  }

  // ── PUBLIC UPDATE ─────────────────────────────────────────────

  public update(delta: number): void {
    const keys = this.controls.keys;

    this.bulletCooldown  = Math.max(0, this.bulletCooldown  - delta);
    this.missileCooldown = Math.max(0, this.missileCooldown - delta);

    if (keys['KeyZ'] && this.bulletsLeft > 0 && this.bulletCooldown <= 0) {
      this.fireBullet();
      this.bulletCooldown = 1 / this.config.bulletFireRate;
    }

    if (keys['KeyX'] && this.missileCooldown <= 0) {
      this.fireMissile();
      this.missileCooldown = 1 / this.config.missileFireRate;
    }

    this.updateFlashes(delta);
  }

  // ── PRIVATE: fire ─────────────────────────────────────────────

  private fireBullet(): void {
    this.bulletsLeft--;

    const barrelLocal = GUN_BARRELS[this.barrelIndex % GUN_BARRELS.length];
    const flashIdx    = this.barrelIndex % GUN_BARRELS.length;
    this.barrelIndex++;

    const { origin, forward } = this.getWorldTransform(barrelLocal);

    const spread = 0.0018;
    forward.x += (Math.random() - 0.5) * spread;
    forward.y += (Math.random() - 0.5) * spread;
    forward.normalize();

    this.projectileManager.spawn('bullet', origin, forward, this.getCockpitVelocity());
    this.triggerFlash(flashIdx);

    // ✅ Bullet fire sound — short, high pitch variation for rapid fire feel
    this.sound.play('bullet_fire', 0.75, 0.08);
  }

  private fireMissile(): void {
    const { origin, forward } = this.getWorldTransform(MISSILE_HARDPOINT);
    this.projectileManager.spawn('missile', origin, forward, this.getCockpitVelocity());

    // ✅ Missile launch sound — louder, low pitch variation
    this.sound.play('missile_fire', 1.0, 0.03);
  }

  // ── PRIVATE: flash update ─────────────────────────────────────

  private updateFlashes(delta: number): void {
    for (let i = 0; i < this.muzzleFlashes.length; i++) {
      if (this.flashTimers[i] <= 0) continue;

      this.flashTimers[i] -= delta;
      const t = Math.max(0, this.flashTimers[i] / this.FLASH_DURATION);

      const { core, primary, secondary } = this.muzzleFlashes[i];

      const coreT = t > 0.5 ? 1.0 : t * 2;
      (core.material      as THREE.SpriteMaterial).opacity = 0.95 * coreT;
      (primary.material   as THREE.SpriteMaterial).opacity = 0.85 * t;
      (secondary.material as THREE.SpriteMaterial).opacity = 0.45 * Math.sqrt(t);

      const bloomScale = 4.5 + (1 - t) * 3.5;
      secondary.scale.setScalar(bloomScale);
    }
  }

  // ── PRIVATE: helpers ──────────────────────────────────────────

  private getWorldTransform(localOffset: THREE.Vector3): {
    origin:  THREE.Vector3;
    forward: THREE.Vector3;
  } {
    this.cockpitModel.updateWorldMatrix(true, false);

    const origin = localOffset.clone();
    this.cockpitModel.localToWorld(origin);

    const forward = new THREE.Vector3(0, 0.06, 1);
    forward.applyQuaternion(this.cockpitModel.quaternion).normalize();

    return { origin, forward };
  }

  private _cockpitSpeed = 255;

  public setCockpitSpeed(speed: number): void {
    this._cockpitSpeed = speed;
  }

  private getCockpitVelocity(): THREE.Vector3 {
    const fwd = new THREE.Vector3(0, 0, -1);
    fwd.applyQuaternion(this.cockpitModel.quaternion);
    return fwd.multiplyScalar(this._cockpitSpeed);
  }

  private triggerFlash(index: number): void {
    if (index < 0 || index >= this.muzzleFlashes.length) return;
    this.flashTimers[index] = this.FLASH_DURATION;

    const { core, primary, secondary } = this.muzzleFlashes[index];
    (core.material      as THREE.SpriteMaterial).opacity = 0.95;
    (primary.material   as THREE.SpriteMaterial).opacity = 0.85;
    (secondary.material as THREE.SpriteMaterial).opacity = 0.45;
    secondary.scale.setScalar(4.5);
  }

  // ── PUBLIC ────────────────────────────────────────────────────

  public getAmmoState(): { bullets: number; missiles: number } {
    return { bullets: this.bulletsLeft, missiles: Infinity };
  }

  public dispose(): void {
    for (const flash of this.muzzleFlashes) {
      this.cockpitModel.remove(flash.group);
    }
  }
}