import * as THREE from 'three';
import { Controls } from './Controls';
import { ProjectileManager } from './ProjectileManager';

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────
interface WeaponConfig {
  bulletFireRate:  number;   // rounds / second
  missileFireRate: number;
  maxBullets:      number;
  // maxMissiles intentionally removed — missiles are unlimited
}

const DEFAULT_CONFIG: WeaponConfig = {
  bulletFireRate:  18,
  missileFireRate: 0.7,
  maxBullets:      10350,
};

const GUN_BARRELS: THREE.Vector3[] = [
  new THREE.Vector3(10, -7, -50),
  new THREE.Vector3(9.8, -7, -50),
  new THREE.Vector3(10, -6.8, -50),
  new THREE.Vector3(9.8, -6.8, -50),
  new THREE.Vector3(9.8, -6.8, -50),
  // new THREE.Vector3(10, -7, -50),
  // new THREE.Vector3(9, -7, -50),
  // new THREE.Vector3(10, -6, -50),
  // new THREE.Vector3(9, -6, -50),
  // new THREE.Vector3(9.5, -6.5, -50),
];

const MISSILE_HARDPOINT = new THREE.Vector3(-10, -10, -60);

// ─────────────────────────────────────────────
//  Muzzle flash — layered for realism
//
//  Real muzzle flashes have:
//    1. A white-hot core (instant, very bright)
//    2. An orange/yellow primary flash cone (forward biased)
//    3. A spherical secondary flash (hot gas expanding radially)
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

  // 1. Bright white core
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    color:       0xffffff,
    transparent: true,
    opacity:     0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  }));
  core.scale.set(1.8, 1.8, 1);
  core.name = 'core';
  group.add(core);

  // 2. Primary flash cone — slightly forward, elongated in firing direction
  const primary = new THREE.Sprite(new THREE.SpriteMaterial({
    color:       0xffcc44,
    transparent: true,
    opacity:     0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  }));
  primary.scale.set(2.2, 3.8, 1);
  primary.position.set(0, 0, -1.5);
  primary.name = 'primary';
  group.add(primary);

  // 3. Radial secondary flash (hot gas bloom)
  const secondary = new THREE.Sprite(new THREE.SpriteMaterial({
    color:       0xff8800,
    transparent: true,
    opacity:     0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
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
  public bulletsLeft:  number;

  // Missiles are unlimited — no counter needed, but expose for HUD compat
  public readonly missilesLeft = Infinity;

  private bulletCooldown  = 0;
  private missileCooldown = 0;
  private barrelIndex     = 0;

  private muzzleFlashes: MuzzleFlash[] = [];
  private flashTimers:   number[]      = [];

  // Flash lifetime — short; real muzzle flash is < 1 frame at 60 fps
  private readonly FLASH_DURATION = 0.038;  // s

  private config: WeaponConfig;

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

  // ── INIT ────────────────────────────────────

  private initMuzzleFlashes(): void {
    for (let i = 0; i < GUN_BARRELS.length; i++) {
      const flash = makeMuzzleFlash(this.cockpitModel, GUN_BARRELS[i]);
      this.muzzleFlashes.push(flash);
      this.flashTimers.push(0);
    }
  }

  // ── PUBLIC UPDATE ────────────────────────────

  public update(delta: number): void {
    const keys = this.controls.keys;

    this.bulletCooldown  = Math.max(0, this.bulletCooldown  - delta);
    this.missileCooldown = Math.max(0, this.missileCooldown - delta);

    // Bullets: limited by bulletsLeft
    if (keys['KeyZ'] && this.bulletsLeft > 0 && this.bulletCooldown <= 0) {
      this.fireBullet();
      this.bulletCooldown = 1 / this.config.bulletFireRate;
    }

    // Missiles: unlimited — only rate-limited
    if (keys['KeyX'] && this.missileCooldown <= 0) {
      this.fireMissile();
      this.missileCooldown = 1 / this.config.missileFireRate;
    }

    this.updateFlashes(delta);
  }

  // ── PRIVATE: fire ────────────────────────────

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
  }

  private fireMissile(): void {
    // No decrement — missiles are unlimited
    const { origin, forward } = this.getWorldTransform(MISSILE_HARDPOINT);
    this.projectileManager.spawn('missile', origin, forward, this.getCockpitVelocity());
  }

  // ── PRIVATE: flash update ────────────────────

  private updateFlashes(delta: number): void {
    for (let i = 0; i < this.muzzleFlashes.length; i++) {
      if (this.flashTimers[i] <= 0) continue;

      this.flashTimers[i] -= delta;
      const t = Math.max(0, this.flashTimers[i] / this.FLASH_DURATION);  // 1→0

      const { core, primary, secondary } = this.muzzleFlashes[i];

      // Core: instant, sharp; stays bright then fades in second half
      const coreT = t > 0.5 ? 1.0 : t * 2;
      (core.material      as THREE.SpriteMaterial).opacity = 0.95 * coreT;

      // Primary flash cone: brightest in first half, rapid fade
      (primary.material   as THREE.SpriteMaterial).opacity = 0.85 * t;

      // Secondary bloom: larger, dimmer, fades slower
      (secondary.material as THREE.SpriteMaterial).opacity = 0.45 * Math.sqrt(t);

      // Bloom expands as gas vents outward
      const bloomScale = 4.5 + (1 - t) * 3.5;
      secondary.scale.setScalar(bloomScale);
    }
  }

  // ── PRIVATE: helpers ─────────────────────────

  private getWorldTransform(localOffset: THREE.Vector3): {
    origin:  THREE.Vector3;
    forward: THREE.Vector3;
  } {
    this.cockpitModel.updateWorldMatrix(true, false);

    const origin = localOffset.clone();
    this.cockpitModel.localToWorld(origin);

    const forward = new THREE.Vector3(0, 70, 1000);
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

  // ── PUBLIC ───────────────────────────────────

  public getAmmoState(): { bullets: number; missiles: number } {
    return { bullets: this.bulletsLeft, missiles: Infinity };
  }

  public dispose(): void {
    for (const flash of this.muzzleFlashes) {
      this.cockpitModel.remove(flash.group);
    }
  }
}