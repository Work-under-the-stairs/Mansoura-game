import * as THREE from 'three';

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
export type ProjectileKind = 'bullet' | 'missile';

export interface Projectile {
  kind:      ProjectileKind;
  mesh:      THREE.Object3D;
  velocity:  THREE.Vector3;   // world-space velocity (units/s)
  life:      number;          // seconds remaining before auto-destroy
  alive:     boolean;

  // missile-only
  smokeTimer?: number;        // seconds until next smoke puff
}

// ─────────────────────────────────────────────
//  Shared geometry / material (created once)
// ─────────────────────────────────────────────
const BULLET_GEO  = new THREE.CylinderGeometry(0.18, 0.18, 3.5, 6);
BULLET_GEO.rotateX(Math.PI / 2);                      // point along +Z

const BULLET_MAT  = new THREE.MeshBasicMaterial({ color: 0xffe87a });

const MISSILE_BODY_GEO  = new THREE.CylinderGeometry(0.35, 0.25, 6, 8);
MISSILE_BODY_GEO.rotateX(Math.PI / 2);

const MISSILE_NOSE_GEO  = new THREE.ConeGeometry(0.35, 2.5, 8);
MISSILE_NOSE_GEO.rotateX(Math.PI / 2);
MISSILE_NOSE_GEO.translate(0, 0, -4.25);              // tip forward

const MISSILE_MAT  = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.8, roughness: 0.3 });
const MISSILE_NOSE_MAT = new THREE.MeshStandardMaterial({ color: 0x445566, metalness: 0.9, roughness: 0.2 });

// Glow sprite for bullet tracer
const TRACER_MAT  = new THREE.SpriteMaterial({
  color:       0xffdd44,
  transparent: true,
  opacity:     0.55,
  blending:    THREE.AdditiveBlending,
  depthWrite:  false,
});

// Smoke particle material (reused for all puffs)
const SMOKE_MAT   = new THREE.SpriteMaterial({
  color:       0xaaaaaa,
  transparent: true,
  opacity:     0.35,
  blending:    THREE.NormalBlending,
  depthWrite:  false,
});

// ─────────────────────────────────────────────
//  Smoke puff helper
// ─────────────────────────────────────────────
interface SmokePuff {
  sprite: THREE.Sprite;
  life:   number;     // 0–1 normalized age
}

// ─────────────────────────────────────────────
//  ProjectileManager
// ─────────────────────────────────────────────
export class ProjectileManager {
  private projectiles: Projectile[]  = [];
  private smokePuffs:  SmokePuff[]   = [];

  // Tunables
  private readonly BULLET_SPEED   = 4800;   // units / s
  private readonly BULLET_LIFE    = 1.6;    // s
  private readonly MISSILE_SPEED  = 1800;   // units / s  (accelerates over time)
  private readonly MISSILE_ACCEL  = 220;    // units / s²
  private readonly MISSILE_LIFE   = 8.0;    // s
  private readonly SMOKE_INTERVAL = 0.045;  // s between puffs
  private readonly SMOKE_LIFE_MAX = 1.2;    // s each puff stays

  constructor(private scene: THREE.Scene) {}

  // ── PUBLIC API ──────────────────────────────

  /**
   * Spawn a bullet or missile.
   * @param origin    World-space spawn position (e.g. gun barrel tip)
   * @param direction Normalized world-space forward direction
   * @param baseVelocity Cockpit velocity to add (inherits momentum)
   */
  public spawn(
    kind:         ProjectileKind,
    origin:       THREE.Vector3,
    direction:    THREE.Vector3,
    baseVelocity: THREE.Vector3 = new THREE.Vector3(),
  ): void {
    if (kind === 'bullet') {
      this.spawnBullet(origin, direction, baseVelocity);
    } else {
      this.spawnMissile(origin, direction, baseVelocity);
    }
  }

  public update(delta: number): void {
    this.updateProjectiles(delta);
    this.updateSmoke(delta);
  }

  public dispose(): void {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const s of this.smokePuffs)  this.scene.remove(s.sprite);
    this.projectiles = [];
    this.smokePuffs  = [];
  }

  // ── PRIVATE: spawn ───────────────────────────

  private spawnBullet(
    origin:    THREE.Vector3,
    dir:       THREE.Vector3,
    baseVel:   THREE.Vector3,
  ): void {


    const group = new THREE.Group();
    console.log('Bullet spawned at:', origin, 'direction:', dir);

    // Tracer body
    const mesh = new THREE.Mesh(BULLET_GEO, BULLET_MAT);
    group.add(mesh);

    // Glow sprite
    const tracer = new THREE.Sprite(TRACER_MAT.clone());
    tracer.scale.set(1.4, 1.4, 1.4);
    group.add(tracer);

    // Point along direction
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    group.quaternion.copy(quaternion);
    group.position.copy(origin);
    this.scene.add(group);

    const velocity = dir.clone().multiplyScalar(this.BULLET_SPEED).add(baseVel);

    this.projectiles.push({
      kind:    'bullet',
      mesh:    group,
      velocity,
      life:    this.BULLET_LIFE,
      alive:   true,
    });
  }

  private spawnMissile(
    origin:    THREE.Vector3,
    dir:       THREE.Vector3,
    baseVel:   THREE.Vector3,
  ): void {
    const group = new THREE.Group();

    console.log('Missile spawned at:', origin, 'direction:', dir);

    const body = new THREE.Mesh(MISSILE_BODY_GEO, MISSILE_MAT);
    group.add(body);

    const nose = new THREE.Mesh(MISSILE_NOSE_GEO, MISSILE_NOSE_MAT);
    group.add(nose);

    // Fin geometry (simple flat quads)
    const finGeo = new THREE.BoxGeometry(3.5, 0.08, 1.2);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x667788, metalness: 0.7, roughness: 0.4 });
    const fin1 = new THREE.Mesh(finGeo, finMat);
    fin1.position.set(0, 0, 2.5);
    const fin2 = fin1.clone();
    fin2.rotation.z = Math.PI / 2;
    group.add(fin1, fin2);

    // Exhaust glow sprite
    const exhaustGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color:       0xff6600,
        transparent: true,
        opacity:     0.7,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
      })
    );
    exhaustGlow.scale.set(2.5, 2.5, 2.5);
    exhaustGlow.position.set(0, 0, 4);   // rear of missile
    exhaustGlow.name = 'exhaustGlow';
    group.add(exhaustGlow);

    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    group.quaternion.copy(quaternion);
    group.position.copy(origin);
    this.scene.add(group);

    const velocity = dir.clone().multiplyScalar(this.MISSILE_SPEED).add(baseVel);

    this.projectiles.push({
      kind:        'missile',
      mesh:        group,
      velocity,
      life:        this.MISSILE_LIFE,
      alive:       true,
      smokeTimer:  0,
    });
  }

  // ── PRIVATE: update ──────────────────────────

  private updateProjectiles(delta: number): void {
    const toRemove: Projectile[] = [];

    for (const p of this.projectiles) {
      if (!p.alive) continue;

      p.life -= delta;
      if (p.life <= 0) {
        p.alive = false;
        toRemove.push(p);
        continue;
      }

      // Missile acceleration
      if (p.kind === 'missile') {
        const dir = p.velocity.clone().normalize();
        p.velocity.addScaledVector(dir, this.MISSILE_ACCEL * delta);

        // Pulse exhaust glow
        const glow = p.mesh.getObjectByName('exhaustGlow') as THREE.Sprite | undefined;
        if (glow) {
          const pulse = 0.7 + 0.5 * Math.sin(Date.now() * 0.03);
          glow.scale.setScalar(2.5 * pulse);
          (glow.material as THREE.SpriteMaterial).opacity = 0.5 + 0.3 * pulse;
        }

        // Smoke trail
        p.smokeTimer! -= delta;
        if (p.smokeTimer! <= 0) {
          p.smokeTimer = this.SMOKE_INTERVAL;
          this.spawnSmokePuff(p.mesh.position.clone());
        }
      }

      // Move
      p.mesh.position.addScaledVector(p.velocity, delta);

      // Fade bullet tracer near end of life
      if (p.kind === 'bullet' && p.life < 0.25) {
        p.mesh.children.forEach((c) => {
          if (c instanceof THREE.Sprite) {
            (c.material as THREE.SpriteMaterial).opacity = p.life / 0.25 * 0.55;
          }
        });
      }
    }

    // Cleanup dead projectiles
    for (const p of toRemove) {
      this.scene.remove(p.mesh);
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private spawnSmokePuff(position: THREE.Vector3): void {
    const mat = SMOKE_MAT.clone();
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.setScalar(4 + Math.random() * 3);
    this.scene.add(sprite);
    this.smokePuffs.push({ sprite, life: 0 });
  }

  private updateSmoke(delta: number): void {
    const toRemove: SmokePuff[] = [];

    for (const s of this.smokePuffs) {
      s.life += delta / this.SMOKE_LIFE_MAX;

      // Expand + fade
      const scale = (4 + s.life * 14);
      s.sprite.scale.setScalar(scale);
      (s.sprite.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - s.life);

      if (s.life >= 1) {
        this.scene.remove(s.sprite);
        toRemove.push(s);
      }
    }

    this.smokePuffs = this.smokePuffs.filter((s) => !toRemove.includes(s));
  }
}