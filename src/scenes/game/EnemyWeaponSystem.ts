import * as THREE from 'three';
import { ProjectileManager } from './ProjectileManager';

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────

/** Bullets per second per enemy. */
// const ENEMY_BULLET_FIRE_RATE = 50.0; // Significantly increased for fighting game speed
const ENEMY_BULLET_FIRE_RATE = 3.0; // Significantly increased for fighting game speed

/** Missiles per second per enemy. */
// const ENEMY_MISSILE_FIRE_RATE = 20.0; // Significantly increased for fighting game speed
const ENEMY_MISSILE_FIRE_RATE = 0.3; // Significantly increased for fighting game speed

/** Local offsets (relative to enemy model) where bullets emerge. */
const ENEMY_GUN_BARRELS: THREE.Vector3[] = [
  new THREE.Vector3( 6, -3, 20),
  new THREE.Vector3(-6, -3, 20),
];

/** Local offset where enemy missiles emerge. */
const ENEMY_MISSILE_HARDPOINT = new THREE.Vector3(0, -5, 25);

/**
 * Slight aim imperfection — gives enemies a "not a robot" feel.
 * Higher = less accurate.
 */
const AIM_SPREAD = 0.001; // Reduced for more precise hits

// ─────────────────────────────────────────────
//  Per-enemy state
// ─────────────────────────────────────────────
interface EnemyGunState {
  enemy:           THREE.Object3D;
  bulletCooldown:  number;
  missileCooldown: number;
  barrelIndex:     number;
}

// ─────────────────────────────────────────────
//  Muzzle flash
// ─────────────────────────────────────────────
interface MuzzleFlash {
  group:     THREE.Group;
  core:      THREE.Sprite;
  secondary: THREE.Sprite;
}

function makeMuzzleFlash(parent: THREE.Object3D, barrelPos: THREE.Vector3): MuzzleFlash {
  const group = new THREE.Group();
  group.position.copy(barrelPos);

  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.scale.set(1.6, 1.6, 1);
  group.add(core);

  const secondary = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xff6600, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  secondary.scale.set(4.0, 4.0, 1);
  group.add(secondary);

  parent.add(group);
  return { group, core, secondary };
}

// ─────────────────────────────────────────────
//  EnemyWeaponSystem
// ─────────────────────────────────────────────
export class EnemyWeaponSystem {

  private readonly FLASH_DURATION = 0.040; // seconds

  /**
   * Flat map of flash state keyed by `enemyUUID_barrelIndex`.
   * Keeps flash entries alive even while enemies are moving.
   */
  private flashMap    = new Map<string, { flash: MuzzleFlash; timer: number }>();
  private enemyStates: EnemyGunState[] = [];

  constructor(
    private scene:             THREE.Scene,
    private projectileManager: ProjectileManager,
    private cockpitModel:      THREE.Object3D,
  ) {}

  // ── PUBLIC API ──────────────────────────────

  /**
   * Call whenever EnemyManager spawns a new enemy.
   * Attaches muzzle flash sprites into the enemy's local space.
   */
  public registerEnemy(enemy: THREE.Object3D): void {
    // Stagger cooldowns so enemies don't all fire simultaneously
    const bulletOffset  = 0; // Removed random offset for simultaneous firing
    const missileOffset = 0; // Removed random offset for simultaneous firing

    this.enemyStates.push({
      enemy,
      bulletCooldown:  bulletOffset,
      missileCooldown: missileOffset,
      barrelIndex:     0,
    });

    // Attach flash nodes to the enemy model
    const id = enemy.uuid;
    ENEMY_GUN_BARRELS.forEach((barrelPos, i) => {
      const flash = makeMuzzleFlash(enemy, barrelPos);
      this.flashMap.set(`${id}_${i}`, { flash, timer: 0 });
    });
  }

  /** Call whenever EnemyManager removes an enemy. */
  public unregisterEnemy(enemy: THREE.Object3D): void {
    this.enemyStates = this.enemyStates.filter((s) => s.enemy !== enemy);

    const id = enemy.uuid;
    ENEMY_GUN_BARRELS.forEach((_, i) => {
      const key   = `${id}_${i}`;
      const entry = this.flashMap.get(key);
      if (entry) {
        enemy.remove(entry.flash.group);
        this.flashMap.delete(key);
      }
    });
  }

  /** Call once per frame from the main game loop. */
  public update(delta: number): void {
    const cockpitPos = new THREE.Vector3();
    this.cockpitModel.getWorldPosition(cockpitPos);

    for (const state of this.enemyStates) {
      state.bulletCooldown  = Math.max(0, state.bulletCooldown  - delta);
      state.missileCooldown = Math.max(0, state.missileCooldown - delta);

      if (state.bulletCooldown <= 0) {
        this.fireEnemyBullet(state, cockpitPos);
        state.bulletCooldown = 1 / ENEMY_BULLET_FIRE_RATE;
      }

      if (state.missileCooldown <= 0) {
        this.fireEnemyMissile(state, cockpitPos);
        state.missileCooldown = 1 / ENEMY_MISSILE_FIRE_RATE;
      }
    }

    this.updateFlashes(delta);
  }

  // ── FIRE ────────────────────────────────────

  private fireEnemyBullet(state: EnemyGunState, cockpitPos: THREE.Vector3): void {
    const barrelIdx   = state.barrelIndex % ENEMY_GUN_BARRELS.length;
    const barrelLocal = ENEMY_GUN_BARRELS[barrelIdx];
    state.barrelIndex++;

    const { origin, forward } = this.getWorldTransform(state.enemy, barrelLocal, cockpitPos);

    // Slight spread — enemies are dangerous but not perfect
    forward.x += (Math.random() - 0.5) * AIM_SPREAD;
    forward.y += (Math.random() - 0.5) * AIM_SPREAD;
    forward.normalize();

    this.projectileManager.spawn('bullet', origin, forward, this.getEnemyVelocity(state.enemy));
    this.triggerFlash(state.enemy.uuid, barrelIdx);
  }

  private fireEnemyMissile(state: EnemyGunState, cockpitPos: THREE.Vector3): void {
    const { origin, forward } = this.getWorldTransform(
      state.enemy, ENEMY_MISSILE_HARDPOINT, cockpitPos,
    );
    this.projectileManager.spawn('missile', origin, forward, this.getEnemyVelocity(state.enemy));
  }

  // ── FLASH ────────────────────────────────────

  private triggerFlash(enemyId: string, barrelIdx: number): void {
    const entry = this.flashMap.get(`${enemyId}_${barrelIdx}`);
    if (!entry) return;

    entry.timer = this.FLASH_DURATION;
    (entry.flash.core.material      as THREE.SpriteMaterial).opacity = 0.95;
    (entry.flash.secondary.material as THREE.SpriteMaterial).opacity = 0.45;
    entry.flash.secondary.scale.setScalar(4.0);
  }

  private updateFlashes(delta: number): void {
    for (const [, entry] of this.flashMap) {
      if (entry.timer <= 0) continue;
      entry.timer -= delta;
      const t = Math.max(0, entry.timer / this.FLASH_DURATION); // 1 → 0

      (entry.flash.core.material      as THREE.SpriteMaterial).opacity = 0.95 * t;
      (entry.flash.secondary.material as THREE.SpriteMaterial).opacity = 0.45 * Math.sqrt(t);
      entry.flash.secondary.scale.setScalar(4.0 + (1 - t) * 3.0);
    }
  }

  // ── HELPERS ──────────────────────────────────

  /**
   * Converts a local barrel offset to world space and computes
   * a direction vector aimed at the cockpit.
   */
  private getWorldTransform(
    enemy:       THREE.Object3D,
    localOffset: THREE.Vector3,
    cockpitPos:  THREE.Vector3,
  ): { origin: THREE.Vector3; forward: THREE.Vector3 } {
    enemy.updateWorldMatrix(true, false);

    const origin  = localOffset.clone();
    enemy.localToWorld(origin);

    // Direct aim at cockpit world position
    const forward = cockpitPos.clone().sub(origin).normalize();

    return { origin, forward };
  }

  /** Approximates the enemy's current velocity for projectile inheritance. */
  private getEnemyVelocity(enemy: THREE.Object3D): THREE.Vector3 {
    const fwd = new THREE.Vector3(0, 0, 1);
    fwd.applyQuaternion(enemy.quaternion);
    return fwd.multiplyScalar(500); // Greatly increased projectile speed
  }
}
