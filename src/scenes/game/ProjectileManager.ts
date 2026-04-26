import * as THREE from 'three';

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
export type ProjectileKind = 'bullet' | 'missile';

export interface Projectile {
  kind:         ProjectileKind;
  mesh:         THREE.Object3D;
  velocity:     THREE.Vector3;   // world-space velocity (units/s)
  life:         number;          // seconds remaining before auto-destroy
  maxLife:      number;          // original life duration (for fade math)
  alive:        boolean;

  // bullet-only: tracer line rendering
  prevPosition?: THREE.Vector3;  // position at last frame (for streak)
  tracerLine?:   THREE.Line;     // the streak line object in scene

  // missile-only
  smokeTimer?:   number;         // seconds until next smoke puff
}

// ─────────────────────────────────────────────
//  Smoke puff state
// ─────────────────────────────────────────────
interface SmokePuff {
  sprite:        THREE.Sprite;
  life:          number;   // 0→1 normalized age
  initialScale:  number;
  rotationSpeed: number;
}

// ─────────────────────────────────────────────
//  Helper — build a round sprite material
// ─────────────────────────────────────────────
function makeSpriteMat(
  color: number,
  opacity: number,
  additive = false,
): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    color,
    transparent: true,
    opacity,
    blending:   additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
}

// ─────────────────────────────────────────────
//  Build missile mesh (called fresh per instance)
// ─────────────────────────────────────────────
function buildMissileMesh(): THREE.Group {
  const group = new THREE.Group();

  // ── Body ──
  const bodyGeo = new THREE.CylinderGeometry(0.38, 0.30, 8.0, 12);
  bodyGeo.rotateX(Math.PI / 2);
  const bodyMat = new THREE.MeshStandardMaterial({
    color:     0x8a9eae,
    metalness: 0.88,
    roughness: 0.22,
  });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // ── Nose cone ──
  const noseGeo = new THREE.ConeGeometry(0.38, 3.2, 12);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.translate(0, 0, -5.6);
  const noseMat = new THREE.MeshStandardMaterial({
    color:     0x2e4050,
    metalness: 0.92,
    roughness: 0.18,
  });
  group.add(new THREE.Mesh(noseGeo, noseMat));

  // ── Seeker dome (glass tip) ──
  const domeGeo = new THREE.SphereGeometry(0.22, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.rotateX(-Math.PI / 2);
  domeGeo.translate(0, 0, -7.2);
  const domeMat = new THREE.MeshStandardMaterial({
    color:       0x88ccff,
    metalness:   0.1,
    roughness:   0.05,
    transparent: true,
    opacity:     0.7,
  });
  group.add(new THREE.Mesh(domeGeo, domeMat));

  // ── Mid-body ring band (detail stripe) ──
  const ringGeo = new THREE.TorusGeometry(0.40, 0.055, 8, 20);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color:     0xffcc00,
    metalness: 0.6,
    roughness: 0.3,
    emissive:  0xffaa00,
    emissiveIntensity: 0.3,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(0, 0, -1.0);
  group.add(ring);

  // ── Cruciform fins (4 swept delta fins) ──
  const finMat = new THREE.MeshStandardMaterial({
    color:     0x607080,
    metalness: 0.75,
    roughness: 0.35,
  });
  for (let i = 0; i < 4; i++) {
    // Each fin is a thin box, angled/swept
    const finGeo = new THREE.BoxGeometry(4.2, 0.06, 1.8);
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.set(0, 0, 3.2);
    group.add(fin);
  }

  // ── Nozzle bell (dark rim at rear) ──
  const nozzleGeo = new THREE.CylinderGeometry(0.34, 0.28, 0.6, 12);
  nozzleGeo.rotateX(Math.PI / 2);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color:     0x111820,
    metalness: 0.97,
    roughness: 0.08,
  });
  const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzle.position.set(0, 0, 4.3);
  group.add(nozzle);

  // ── Exhaust: 3-layer sprite stack for hot engine plume ──
  //    Core (white-hot, tight)
  const exhaustCore = new THREE.Sprite(makeSpriteMat(0xffffff, 0.95, true));
  exhaustCore.scale.set(1.4, 1.4, 1);
  exhaustCore.position.set(0, 0, 5.0);
  exhaustCore.name = 'exhaustCore';
  group.add(exhaustCore);

  //    Mid flame (intense blue-white → orange)
  const exhaustMid = new THREE.Sprite(makeSpriteMat(0xff7722, 0.80, true));
  exhaustMid.scale.set(2.8, 2.8, 1);
  exhaustMid.position.set(0, 0, 5.8);
  exhaustMid.name = 'exhaustMid';
  group.add(exhaustMid);

  //    Outer bloom (diffuse amber)
  const exhaustOuter = new THREE.Sprite(makeSpriteMat(0xff9900, 0.40, true));
  exhaustOuter.scale.set(5.5, 5.5, 1);
  exhaustOuter.position.set(0, 0, 6.5);
  exhaustOuter.name = 'exhaustOuter';
  group.add(exhaustOuter);

  //    Long flame tail (streaks behind)
  const flameTail = new THREE.Sprite(makeSpriteMat(0xff4400, 0.25, true));
  flameTail.scale.set(2.2, 9.0, 1);
  flameTail.position.set(0, 0, 8.5);
  flameTail.name = 'flameTail';
  group.add(flameTail);

  return group;
}

// ─────────────────────────────────────────────
//  ProjectileManager
// ─────────────────────────────────────────────
export class ProjectileManager {
  private projectiles: Projectile[] = [];
  private smokePuffs:  SmokePuff[]  = [];

  // ── Tunables ────────────────────────────────
  private readonly BULLET_SPEED      = 4800;
  private readonly BULLET_LIFE       = 1.6;

  // Tracer streak length = BULLET_SPEED * TRACER_DURATION
  // At 4800 u/s × 0.016 s = ~77 units of visible streak per frame
  // We keep N frames of history to draw a longer, more visible tracer
  private readonly TRACER_LENGTH     = 120;   // world-units — visible streak length

  private readonly MISSILE_SPEED     = 1800;
  private readonly MISSILE_ACCEL     = 220;
  private readonly MISSILE_LIFE      = 8.0;
  private readonly SMOKE_INTERVAL    = 0.032;  // s — dense trail
  private readonly SMOKE_LIFE_MAX    = 1.8;    // s — lingers longer

  constructor(private scene: THREE.Scene) {}

  // ── PUBLIC API ──────────────────────────────

  public spawn(
    kind:         ProjectileKind,
    origin:       THREE.Vector3,
    direction:    THREE.Vector3,
    baseVelocity: THREE.Vector3 = new THREE.Vector3(),
  ): void {
    kind === 'bullet'
      ? this.spawnBullet(origin, direction, baseVelocity)
      : this.spawnMissile(origin, direction, baseVelocity);
  }

  public update(delta: number): void {
    this.updateProjectiles(delta);
    this.updateSmoke(delta);
  }

  public dispose(): void {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      if (p.tracerLine) this.scene.remove(p.tracerLine);
    }
    for (const s of this.smokePuffs) this.scene.remove(s.sprite);
    this.projectiles = [];
    this.smokePuffs  = [];
  }

  // ── PRIVATE: spawn ───────────────────────────

  /**
   * BULLET — rendered as a tracer streak line, NOT a moving mesh.
   *
   * Real tracer rounds travel ~900 m/s. At 60 fps that's 15 m per frame —
   * far too fast to see a discrete object. What you actually perceive is a
   * luminous line (streak) sweeping across the scene. We replicate this by:
   *   1. Keeping a "ghost" invisible point-object that moves each frame.
   *   2. Drawing a Line from (currentPos - direction * TRACER_LENGTH) to currentPos.
   *   3. Using vertex colors so the tail fades to transparent.
   */
  private spawnBullet(
    origin:  THREE.Vector3,
    dir:     THREE.Vector3,
    baseVel: THREE.Vector3,
  ): void {
    // Invisible anchor that the physics engine moves
    const anchor = new THREE.Object3D();
    anchor.position.copy(origin);
    this.scene.add(anchor);

    // ── Tracer line geometry ──
    // 2 vertices: [tail, head]. We update them every frame.
    const positions = new Float32Array(2 * 3);  // 2 points × xyz
    const colors    = new Float32Array(2 * 3);  // 2 points × rgb

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    lineGeo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
      linewidth:    1,  // note: WebGL ignores >1 on most GPUs; use fatline for thick
    });

    const tracerLine = new THREE.Line(lineGeo, lineMat);
    this.scene.add(tracerLine);

    // ── Small bright head sprite (the "hot tip") ──
    const headSprite = new THREE.Sprite(makeSpriteMat(0xfffde0, 0.9, true));
    headSprite.scale.set(0.9, 0.9, 1);
    headSprite.name = 'headSprite';
    anchor.add(headSprite);

    const velocity = dir.clone().multiplyScalar(this.BULLET_SPEED).add(baseVel);

    this.projectiles.push({
      kind:         'bullet',
      mesh:         anchor,
      velocity,
      life:         this.BULLET_LIFE,
      maxLife:      this.BULLET_LIFE,
      alive:        true,
      prevPosition: origin.clone(),
      tracerLine,
    });
  }

  private spawnMissile(
    origin:  THREE.Vector3,
    dir:     THREE.Vector3,
    baseVel: THREE.Vector3,
  ): void {
    const group = buildMissileMesh();

    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1), dir,
    );
    group.quaternion.copy(q);
    group.position.copy(origin);
    this.scene.add(group);

    const velocity = dir.clone().multiplyScalar(this.MISSILE_SPEED).add(baseVel);

    this.projectiles.push({
      kind:        'missile',
      mesh:        group,
      velocity,
      life:        this.MISSILE_LIFE,
      maxLife:     this.MISSILE_LIFE,
      alive:       true,
      smokeTimer:  0,
    });
  }

  // ── PRIVATE: update ──────────────────────────

  private updateProjectiles(delta: number): void {
    const toRemove: Projectile[] = [];
    const t = Date.now() * 0.001;

    for (const p of this.projectiles) {
      if (!p.alive) continue;

      p.life -= delta;
      if (p.life <= 0) {
        p.alive = false;
        toRemove.push(p);
        continue;
      }

      // ────────── BULLET ──────────
      if (p.kind === 'bullet') {
        // Move the anchor
        p.mesh.position.addScaledVector(p.velocity, delta);

        // Fade factor for final 20% of life
        const fadeRatio = Math.min(1, p.life / (p.maxLife * 0.20));

        // Update tracer line:
        //   head = current bullet position (world space)
        //   tail = clamped to spawn origin so streak never goes behind gun barrel
        if (p.tracerLine) {
          const head = p.mesh.position.clone();
          const dir  = p.velocity.clone().normalize();

          // How far has this bullet actually travelled since spawn?
          const travelled = p.velocity.length() * (p.maxLife - p.life);
          // Clamp streak length so it doesn't extend behind the barrel on first frames
          const streakLen  = Math.min(this.TRACER_LENGTH, travelled);
          const tail = head.clone().addScaledVector(dir, -streakLen);

          const posAttr = p.tracerLine.geometry.getAttribute('position') as THREE.BufferAttribute;
          // tail vertex (index 0) — dim
          posAttr.setXYZ(0, tail.x, tail.y, tail.z);
          // head vertex (index 1) — bright
          posAttr.setXYZ(1, head.x, head.y, head.z);
          posAttr.needsUpdate = true;

          // Vertex colors: tail = dark orange (dim), head = near-white (hot)
          const colAttr = p.tracerLine.geometry.getAttribute('color') as THREE.BufferAttribute;
          // tail color: faint orange-red
          colAttr.setXYZ(0, 1.0 * 0.6 * fadeRatio, 0.55 * 0.4 * fadeRatio, 0.0);
          // head color: bright white-yellow
          colAttr.setXYZ(1, 1.0 * fadeRatio, 0.97 * fadeRatio, 0.75 * fadeRatio);
          colAttr.needsUpdate = true;

          (p.tracerLine.material as THREE.LineBasicMaterial).opacity = fadeRatio;
        }

        // Fade head sprite
        const headSprite = p.mesh.getObjectByName('headSprite') as THREE.Sprite | undefined;
        if (headSprite) {
          (headSprite.material as THREE.SpriteMaterial).opacity = 0.9 * fadeRatio;
        }
      }

      // ────────── MISSILE ──────────
      if (p.kind === 'missile') {
        // Accelerate along heading
        const dir = p.velocity.clone().normalize();
        p.velocity.addScaledVector(dir, this.MISSILE_ACCEL * delta);

        // Keep missile oriented along velocity
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          dir,
        );
        p.mesh.quaternion.copy(q);

        // Pulse exhaust layers (combustion flicker)
        const flicker     = 0.82 + 0.36 * Math.sin(t * 42 + 1.7);
        const flickerSlow = 0.88 + 0.24 * Math.sin(t * 13);
        const flickerTail = 0.75 + 0.50 * Math.sin(t * 7.5);

        const core  = p.mesh.getObjectByName('exhaustCore')  as THREE.Sprite | undefined;
        const mid   = p.mesh.getObjectByName('exhaustMid')   as THREE.Sprite | undefined;
        const outer = p.mesh.getObjectByName('exhaustOuter') as THREE.Sprite | undefined;
        const tail  = p.mesh.getObjectByName('flameTail')    as THREE.Sprite | undefined;

        if (core) {
          core.scale.setScalar(1.2 + 0.5 * flicker);
          (core.material as THREE.SpriteMaterial).opacity = 0.95 * flicker;
        }
        if (mid) {
          mid.scale.setScalar(2.4 + 1.0 * flickerSlow);
          (mid.material as THREE.SpriteMaterial).opacity = 0.78 * flickerSlow;
        }
        if (outer) {
          outer.scale.setScalar(4.8 + 2.0 * flickerSlow);
          (outer.material as THREE.SpriteMaterial).opacity = 0.38 * flickerSlow;
        }
        if (tail) {
          tail.scale.set(2.0 + flickerTail * 1.2, 8.0 + flickerTail * 6.0, 1);
          (tail.material as THREE.SpriteMaterial).opacity = 0.22 * flickerTail;
        }

        // Emit smoke
        p.smokeTimer! -= delta;
        if (p.smokeTimer! <= 0) {
          p.smokeTimer = this.SMOKE_INTERVAL;
          this.spawnSmokePuff(p.mesh.position.clone(), dir);
        }

        // Move missile (bullets already moved above)
        p.mesh.position.addScaledVector(p.velocity, delta);
      }
    }

    for (const p of toRemove) {
      this.scene.remove(p.mesh);
      if (p.tracerLine) this.scene.remove(p.tracerLine);
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  // ── Smoke puff ───────────────────────────────

  /**
   * Spawn a turbulent exhaust puff with slight random offset perpendicular
   * to the missile's heading, so the trail looks organic rather than linear.
   */
  private spawnSmokePuff(position: THREE.Vector3, forward: THREE.Vector3): void {
    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const drift = right
      .clone()
      .multiplyScalar((Math.random() - 0.5) * 2.5)
      .addScaledVector(up, (Math.random() - 0.5) * 2.5);

    position.add(drift);

    // Colour variety: warm-grey (fresh) → cool-grey (aged)
    const shades = [0xe0ddd8, 0xd0d0d0, 0xc8cdd2, 0xd8d4cf, 0xcfcfcf];
    const color  = shades[Math.floor(Math.random() * shades.length)];

    const mat    = makeSpriteMat(color, 0.42);
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);

    const initialScale = 4.0 + Math.random() * 3.5;
    sprite.scale.setScalar(initialScale);

    this.scene.add(sprite);
    this.smokePuffs.push({
      sprite,
      life:          0,
      initialScale,
      rotationSpeed: (Math.random() - 0.5) * 1.5,
    });
  }

  private updateSmoke(delta: number): void {
    const toRemove: SmokePuff[] = [];

    for (const s of this.smokePuffs) {
      s.life += delta / this.SMOKE_LIFE_MAX;

      // Expand: fast at first (sqrt easing), then slow — natural billowing
      const expand = Math.sqrt(s.life);
      s.sprite.scale.setScalar(s.initialScale + expand * 26);

      // Rotate sprite on Z for turbulent roll
      s.sprite.material.rotation += s.rotationSpeed * delta;

      // Fade: squared for quick fade-in then slow lingering fade
      const fade = 1 - s.life;
      (s.sprite.material as THREE.SpriteMaterial).opacity = 0.42 * fade * fade;

      if (s.life >= 1) {
        this.scene.remove(s.sprite);
        toRemove.push(s);
      }
    }

    this.smokePuffs = this.smokePuffs.filter((s) => !toRemove.includes(s));
  }
}