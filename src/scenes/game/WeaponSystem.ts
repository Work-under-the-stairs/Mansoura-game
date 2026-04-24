import * as THREE from 'three';
import { Controls } from './Controls';
import { ProjectileManager } from './ProjectileManager';

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────
interface WeaponConfig {
  bulletFireRate:  number;   // rounds / second
  missileFireRate: number;   // rounds / second (cooldown between shots)
  maxBullets:      number;   // total ammo
  maxMissiles:     number;
}

const DEFAULT_CONFIG: WeaponConfig = {
  bulletFireRate:  18,       // ~18 rounds/s  (~machine gun rhythm)
  missileFireRate: 0.7,      // 1 missile every ~1.4 s
  maxBullets:      350,
  maxMissiles:     8,
};

// Local-space offsets of gun barrels relative to cockpit model origin
// Adjust X to spread barrels apart, Z = distance forward
const GUN_BARRELS: THREE.Vector3[] = [
  new THREE.Vector3(15, -3, 0),
  new THREE.Vector3( 16, -3, 0),
  // new THREE.Vector3(450, 1450, 6200),
  // new THREE.Vector3(450, 1450, 6200),
];

const MISSILE_HARDPOINT = new THREE.Vector3(-15, -3, 0);

// ─────────────────────────────────────────────
//  Muzzle flash helper (simple sprite)
// ─────────────────────────────────────────────
function makeMuzzleFlash(): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    color:       0xffcc44,
    transparent: true,
    opacity:     0,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(3.5);
  sprite.name = 'muzzleFlash';
  return sprite;
}

// ─────────────────────────────────────────────
//  WeaponSystem
// ─────────────────────────────────────────────
export class WeaponSystem {
  // Ammo state
  public bulletsLeft:  number;
  public missilesLeft: number;

  // Cooldown accumulators (seconds until next allowed shot)
  private bulletCooldown  = 0;
  private missileCooldown = 0;

  // Alternates which barrel fires next
  private barrelIndex = 0;

  // Muzzle flashes (one per barrel)
  private muzzleFlashes: THREE.Sprite[] = [];

  // Flash lifetime
  private readonly FLASH_DURATION = 0.045;  // s
  private flashTimers: number[] = [];

  private config: WeaponConfig;

  constructor(
    private scene:             THREE.Scene,
    private cockpitModel:      THREE.Group,
    private controls:          Controls,
    private projectileManager: ProjectileManager,
    config: Partial<WeaponConfig> = {},
  ) {
    this.config        = { ...DEFAULT_CONFIG, ...config };
    this.bulletsLeft   = this.config.maxBullets;
    this.missilesLeft  = this.config.maxMissiles;

    this.initMuzzleFlashes();
  }

  // ── INIT ────────────────────────────────────

  private initMuzzleFlashes(): void {
    for (let i = 0; i < GUN_BARRELS.length; i++) {
      const flash = makeMuzzleFlash();
      // Attach to cockpit so it moves with it
      flash.position.copy(GUN_BARRELS[i]);
      this.cockpitModel.add(flash);
      this.muzzleFlashes.push(flash);
      this.flashTimers.push(0);
    }
  }

  // ── PUBLIC UPDATE ────────────────────────────

  public update(delta: number): void {
    const keys = this.controls.keys;

    // Tick down cooldowns
    this.bulletCooldown  = Math.max(0, this.bulletCooldown  - delta);
    this.missileCooldown = Math.max(0, this.missileCooldown - delta);

    // Machine gun — KeyZ held
    if (keys['KeyZ'] && this.bulletsLeft > 0 && this.bulletCooldown <= 0) {
    // if (keys['KeyZ'] && this.bulletsLeft > 0 && this.bulletCooldown === 0) {
      this.fireBullet();
      this.bulletCooldown = 1 / this.config.bulletFireRate;
    }

    // Missile — KeyX held (one per cooldown)
    if (keys['KeyX'] && this.missilesLeft > 0 && this.missileCooldown <= 0) {
    // if (keys['KeyX'] && this.missilesLeft > 0 && this.missileCooldown === 0) {
      this.fireMissile();
      this.missileCooldown = 1 / this.config.missileFireRate;
    }

    // Fade muzzle flashes
    for (let i = 0; i < this.muzzleFlashes.length; i++) {
      if (this.flashTimers[i] > 0) {
        this.flashTimers[i] -= delta;
        const t = Math.max(0, this.flashTimers[i] / this.FLASH_DURATION);
        (this.muzzleFlashes[i].material as THREE.SpriteMaterial).opacity = t * 0.95;
      }
    }
  }

  // ── PRIVATE: fire ────────────────────────────

  private fireBullet(): void {
    this.bulletsLeft--;

    // Alternate barrels
    const barrelLocal = GUN_BARRELS[this.barrelIndex % GUN_BARRELS.length];
    this.barrelIndex++;

    const { origin, forward } = this.getWorldTransform(barrelLocal);

    // Slight random spread (realistic machine gun dispersion)
    const spread = 0.0018;
    forward.x += (Math.random() - 0.5) * spread;
    forward.y += (Math.random() - 0.5) * spread;
    forward.normalize();

    this.projectileManager.spawn('bullet', origin, forward, this.getCockpitVelocity());

    // Trigger muzzle flash on the correct barrel
    const flashIdx = (this.barrelIndex - 1) % GUN_BARRELS.length;
    this.triggerFlash(flashIdx);
  }

  private fireMissile(): void {
    this.missilesLeft--;

    const { origin, forward } = this.getWorldTransform(MISSILE_HARDPOINT);
    this.projectileManager.spawn('missile', origin, forward, this.getCockpitVelocity());
  }

  // ── PRIVATE: helpers ─────────────────────────

  /**
   * Convert a local-space offset on the cockpit to a world-space
   * position + normalized forward direction.
   */
  private getWorldTransform(localOffset: THREE.Vector3): {
    origin:  THREE.Vector3;
    forward: THREE.Vector3;
  } {

    this.cockpitModel.updateWorldMatrix(true, false);

    // World position of the barrel tip
    const origin = localOffset.clone();
    this.cockpitModel.localToWorld(origin);

    // const forward = new THREE.Vector3();
    // this.cockpitModel.getWorldDirection(forward);
    // forward.negate();


    // const target = new THREE.Vector3(450, 1450, 6200); // غيري الأرقام دي
    // const target = new THREE.Vector3(0, 0, -1000); // غيري الأرقام دي
    // this.cockpitModel.localToWorld(target);
    
    // const forward = target.sub(origin).normalize();

    // World-space forward = cockpit's -Z axis (Three.js model convention)
    const forward = new THREE.Vector3(0, 70, 1000);
    forward.applyQuaternion(this.cockpitModel.quaternion).normalize();

    return { origin, forward };
  }

  /**
   * Approximate cockpit velocity by sampling its world direction × speed.
   * Cockpit.ts moves the model with translateZ(currentSpeed) every frame,
   * so we read the forward vector and scale by speed per second.
   * Since we don't have direct access to currentSpeed here, we use a
   * reasonable approximation that callers can override via setCockpitSpeed().
   */
  private _cockpitSpeed = 155;   // matches Cockpit.minSpeed default

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
    (this.muzzleFlashes[index].material as THREE.SpriteMaterial).opacity = 0.95;
  }

  // ── PUBLIC GETTERS ───────────────────────────

  public getAmmoState(): { bullets: number; missiles: number } {
    return { bullets: this.bulletsLeft, missiles: this.missilesLeft };
  }

  public dispose(): void {
    for (const flash of this.muzzleFlashes) {
      this.cockpitModel.remove(flash);
    }
  }
}