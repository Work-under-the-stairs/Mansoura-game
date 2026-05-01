import * as THREE from 'three';

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
export type ProjectileKind = 'bullet' | 'missile';

export interface Projectile {
  kind:         ProjectileKind;
  mesh:         THREE.Object3D;
  velocity:     THREE.Vector3;
  life:         number;
  maxLife:      number;
  alive:        boolean;

  prevPosition?: THREE.Vector3;
  tracerLine?:   THREE.Line;
  glowLine?:     THREE.Line;   // second wider/softer line for glow effect

  smokeTimer?:   number;
}

interface SmokePuff {
  sprite:        THREE.Sprite;
  life:          number;
  maxLife:       number;
  initialScale:  number;
  rotationSpeed: number;
  velocity:      THREE.Vector3; // slight drift after spawn
}

// ─────────────────────────────────────────────
//  Smoke canvas texture  (soft gaussian puff)
// ─────────────────────────────────────────────

/**
 * Draws a radial-gradient circle on a canvas and returns it as a texture.
 * This removes the hard rectangular edge of default Sprite rendering.
 *
 * We create one shared texture per colour family so we don't spam the GPU.
 */
function makeSmokeTexture(size = 128): THREE.CanvasTexture {
  const canvas  = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx     = canvas.getContext('2d')!;
  const cx = size / 2, cy = size / 2, r = size / 2;

  // Radial gradient: opaque white-grey centre → fully transparent edge
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0.00, 'rgba(230, 228, 224, 1.0)');  // warm white core
  grad.addColorStop(0.30, 'rgba(210, 208, 205, 0.85)'); // soft mid
  grad.addColorStop(0.65, 'rgba(185, 183, 180, 0.40)'); // feathered
  grad.addColorStop(1.00, 'rgba(160, 158, 155, 0.00)'); // fully transparent

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Subtle noise pass: small semi-transparent circles scattered inside
  // This breaks the too-perfect gaussian look and adds some churn
  for (let i = 0; i < 14; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const dist   = Math.random() * r * 0.55;
    const bx     = cx + Math.cos(angle) * dist;
    const by     = cy + Math.sin(angle) * dist;
    const br     = r * (0.08 + Math.random() * 0.18);
    const alpha  = 0.06 + Math.random() * 0.10;
    const luma   = Math.floor(200 + Math.random() * 30);

    const bgrad  = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bgrad.addColorStop(0,   `rgba(${luma},${luma},${luma},${alpha})`);
    bgrad.addColorStop(1,   `rgba(${luma},${luma},${luma},0)`);
    ctx.fillStyle = bgrad;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Singleton – one texture shared across all smoke puffs
let _smokeTexture: THREE.CanvasTexture | null = null;
function getSmokeTexture(): THREE.CanvasTexture {
  if (!_smokeTexture) _smokeTexture = makeSmokeTexture(128);
  return _smokeTexture;
}

// ─────────────────────────────────────────────
//  Helper — sprite material (no map version for exhaust)
// ─────────────────────────────────────────────
function makeSpriteMat(
  color:   number,
  opacity: number,
  additive = false,
  map?:    THREE.Texture,
): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    color,
    map:         map ?? null,
    transparent: true,
    opacity,
    blending:    additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite:  false,
  });
}

// ─────────────────────────────────────────────
//  Responsive line scale
// ─────────────────────────────────────────────
/**
 * Returns a multiplier based on the shorter viewport dimension.
 * Mobile (~390 px wide) → 1.0  (base)
 * 1080p  (~1920px wide) → ~2.2 (boost so tracers remain visible)
 * 4K     (~3840px wide) → ~3.2 (further boost)
 *
 * We use Math.sqrt so large screens get a moderate boost, not a crazy one.
 */
function screenScaleFactor(): number {
  const ref  = 390; // iPhone-sized reference width
  const dim  = Math.max(window.innerWidth, window.innerHeight); // use longer dim for landscape
  return Math.max(1.0, Math.sqrt(dim / ref));
}

// ─────────────────────────────────────────────
//  Missile mesh builder
// ─────────────────────────────────────────────
function buildMissileMesh(): THREE.Group {
  const group = new THREE.Group();

  const bodyGeo = new THREE.CylinderGeometry(0.38, 0.30, 8.0, 12);
  bodyGeo.rotateX(Math.PI / 2);
  group.add(new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x8a9eae, metalness: 0.88, roughness: 0.22 })));

  const noseGeo = new THREE.ConeGeometry(0.38, 3.2, 12);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.translate(0, 0, -5.6);
  group.add(new THREE.Mesh(noseGeo, new THREE.MeshStandardMaterial({ color: 0x2e4050, metalness: 0.92, roughness: 0.18 })));

  const domeGeo = new THREE.SphereGeometry(0.22, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.rotateX(-Math.PI / 2);
  domeGeo.translate(0, 0, -7.2);
  group.add(new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.7 })));

  const ringGeo = new THREE.TorusGeometry(0.40, 0.055, 8, 20);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.6, roughness: 0.3, emissive: 0xffaa00, emissiveIntensity: 0.3 }));
  ring.position.set(0, 0, -1.0);
  group.add(ring);

  const finMat = new THREE.MeshStandardMaterial({ color: 0x607080, metalness: 0.75, roughness: 0.35 });
  for (let i = 0; i < 4; i++) {
    const finGeo = new THREE.BoxGeometry(4.2, 0.06, 1.8);
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.set(0, 0, 3.2);
    group.add(fin);
  }

  const nozzle = new THREE.Mesh(
    (() => { const g = new THREE.CylinderGeometry(0.34, 0.28, 0.6, 12); g.rotateX(Math.PI / 2); return g; })(),
    new THREE.MeshStandardMaterial({ color: 0x111820, metalness: 0.97, roughness: 0.08 }),
  );
  nozzle.position.set(0, 0, 4.3);
  group.add(nozzle);

  // Exhaust sprites (no change from original — these look fine)
  const exhaustCore = new THREE.Sprite(makeSpriteMat(0xffffff, 0.95, true));
  exhaustCore.scale.set(1.4, 1.4, 1); exhaustCore.position.set(0, 0, 5.0); exhaustCore.name = 'exhaustCore';
  group.add(exhaustCore);

  const exhaustMid = new THREE.Sprite(makeSpriteMat(0xff7722, 0.80, true));
  exhaustMid.scale.set(2.8, 2.8, 1); exhaustMid.position.set(0, 0, 5.8); exhaustMid.name = 'exhaustMid';
  group.add(exhaustMid);

  const exhaustOuter = new THREE.Sprite(makeSpriteMat(0xff9900, 0.40, true));
  exhaustOuter.scale.set(5.5, 5.5, 1); exhaustOuter.position.set(0, 0, 6.5); exhaustOuter.name = 'exhaustOuter';
  group.add(exhaustOuter);

  const flameTail = new THREE.Sprite(makeSpriteMat(0xff4400, 0.25, true));
  flameTail.scale.set(2.2, 9.0, 1); flameTail.position.set(0, 0, 8.5); flameTail.name = 'flameTail';
  group.add(flameTail);

  return group;
}

// ─────────────────────────────────────────────
//  ProjectileManager
// ─────────────────────────────────────────────
export class ProjectileManager {
  private projectiles: Projectile[] = [];
  private smokePuffs:  SmokePuff[]  = [];

  private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  private readonly BULLET_SPEED   = 4800;
  private readonly BULLET_LIFE    = 1.6;
  private readonly TRACER_LENGTH  = 120;

  private readonly MISSILE_SPEED  = 1800;
  private readonly MISSILE_ACCEL  = 220;
  private readonly MISSILE_LIFE   = 8.0;
  // private readonly SMOKE_INTERVAL = 0.028;
  // private readonly SMOKE_INTERVAL = this.isMobile ? 0.15 : 0.028;
  private readonly SMOKE_INTERVAL = this.isMobile ? 0.3 : 0.028;
  // private readonly SMOKE_LIFE_MAX = 2.2;
  private readonly SMOKE_LIFE_MAX = this.isMobile ? 1 : 2.2;

  constructor(private scene: THREE.Scene) {}

  // ── PUBLIC ──────────────────────────────────

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
      if (p.glowLine)   this.scene.remove(p.glowLine);
    }
    for (const s of this.smokePuffs) this.scene.remove(s.sprite);
    this.projectiles = [];
    this.smokePuffs  = [];
  }

  // ── SPAWN ────────────────────────────────────

  private spawnBullet(origin: THREE.Vector3, dir: THREE.Vector3, baseVel: THREE.Vector3): void {
    // ── Invisible anchor (physics point) ──
    const anchor = new THREE.Object3D();
    anchor.position.copy(origin);
    this.scene.add(anchor);

    // ── Core tracer line (sharp, bright) ──
    const coreGeo  = this.makeTracerGeo();
    const coreMat  = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
    });
    const tracerLine = new THREE.Line(coreGeo, coreMat);
    this.scene.add(tracerLine);

    // ── Glow line (wider, softer — faked by using a second line with bloom-like color) ──
    // WebGL doesn't support linewidth > 1, but we can stack a second semi-transparent
    // line with a larger sprite at each vertex to simulate softness on large screens.
    const glowGeo = this.makeTracerGeo();
    const glowMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent:  true,
      blending:     THREE.AdditiveBlending,
      depthWrite:   false,
      opacity:      0.35,
    });
    const glowLine = new THREE.Line(glowGeo, glowMat);
    this.scene.add(glowLine);

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
      glowLine,
    });
  }

  private makeTracerGeo(): THREE.BufferGeometry {
    const positions = new Float32Array(2 * 3);
    const colors    = new Float32Array(2 * 3);
    const geo       = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
    return geo;
  }

  private spawnMissile(origin: THREE.Vector3, dir: THREE.Vector3, baseVel: THREE.Vector3): void {
    const group = buildMissileMesh();
    group.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir));
    group.position.copy(origin);
    this.scene.add(group);

    const velocity = dir.clone().multiplyScalar(this.MISSILE_SPEED).add(baseVel);

    this.projectiles.push({
      kind:       'missile',
      mesh:       group,
      velocity,
      life:       this.MISSILE_LIFE,
      maxLife:    this.MISSILE_LIFE,
      alive:      true,
      smokeTimer: 0,
    });
  }

  // ── UPDATE ───────────────────────────────────

  private updateProjectiles(delta: number): void {
    const toRemove: Projectile[] = [];
    const t = Date.now() * 0.001;

    // Scale tracer brightness/width with screen size
    const ssf = screenScaleFactor();

    for (const p of this.projectiles) {
      if (!p.alive) continue;

      p.life -= delta;
      if (p.life <= 0) {
        p.alive = false;
        toRemove.push(p);
        continue;
      }

      // ─── BULLET ─────────────────────────────
      if (p.kind === 'bullet') {
        p.mesh.position.addScaledVector(p.velocity, delta);

        const fadeRatio  = Math.min(1, p.life / (p.maxLife * 0.20));
        const travelled  = p.velocity.length() * (p.maxLife - p.life);
        const streakLen  = Math.min(this.TRACER_LENGTH * ssf, travelled);
        const dir        = p.velocity.clone().normalize();
        const head       = p.mesh.position.clone();
        const tail       = head.clone().addScaledVector(dir, -streakLen);

        // ── Core line ──
        if (p.tracerLine) {
          this.updateTracerGeo(
            p.tracerLine.geometry,
            tail, head,
            // tail: dim orange-red
            { r: 1.0 * 0.55 * fadeRatio, g: 0.50 * 0.35 * fadeRatio, b: 0.0 },
            // head: hot white-yellow  — boosted on large screens
            { r: Math.min(1, 1.0 * ssf * fadeRatio), g: Math.min(1, 0.97 * ssf * 0.85 * fadeRatio), b: Math.min(1, 0.75 * ssf * 0.6 * fadeRatio) },
          );
          (p.tracerLine.material as THREE.LineBasicMaterial).opacity = Math.min(1, fadeRatio * ssf * 0.9);
        }

        // ── Glow line (slightly longer, softer colours) ──
        if (p.glowLine) {
          const glowTail = head.clone().addScaledVector(dir, -(streakLen * 1.3));
          this.updateTracerGeo(
            p.glowLine.geometry,
            glowTail, head,
            { r: 0.8 * fadeRatio, g: 0.30 * fadeRatio, b: 0.0 },
            { r: Math.min(1, 1.0 * ssf * fadeRatio), g: Math.min(1, 0.75 * ssf * fadeRatio), b: Math.min(1, 0.40 * ssf * fadeRatio) },
          );
          (p.glowLine.material as THREE.LineBasicMaterial).opacity = Math.min(1, 0.30 * ssf * fadeRatio);
        }

        // ── NO headSprite — removed to avoid the square artifact ──
      }

      // ─── MISSILE ────────────────────────────
      if (p.kind === 'missile') {
        const dir = p.velocity.clone().normalize();
        p.velocity.addScaledVector(dir, this.MISSILE_ACCEL * delta);

        p.mesh.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir));

        // Exhaust flicker
        const fl  = 0.82 + 0.36 * Math.sin(t * 42 + 1.7);
        const fls = 0.88 + 0.24 * Math.sin(t * 13);
        const flt = 0.75 + 0.50 * Math.sin(t * 7.5);

        this.setSprite(p.mesh, 'exhaustCore',  (s) => { s.scale.setScalar(1.2 + 0.5 * fl);   (s.material as THREE.SpriteMaterial).opacity = 0.95 * fl; });
        this.setSprite(p.mesh, 'exhaustMid',   (s) => { s.scale.setScalar(2.4 + 1.0 * fls);  (s.material as THREE.SpriteMaterial).opacity = 0.78 * fls; });
        this.setSprite(p.mesh, 'exhaustOuter', (s) => { s.scale.setScalar(4.8 + 2.0 * fls);  (s.material as THREE.SpriteMaterial).opacity = 0.38 * fls; });
        this.setSprite(p.mesh, 'flameTail',    (s) => { s.scale.set(2.0 + flt * 1.2, 8.0 + flt * 6.0, 1); (s.material as THREE.SpriteMaterial).opacity = 0.22 * flt; });

        p.smokeTimer! -= delta;
        if (p.smokeTimer! <= 0) {
          p.smokeTimer = this.SMOKE_INTERVAL;
          this.spawnSmokePuff(p.mesh.position.clone(), dir);
        }

        p.mesh.position.addScaledVector(p.velocity, delta);
      }
    }

    for (const p of toRemove) {
      this.scene.remove(p.mesh);
      if (p.tracerLine) { p.tracerLine.geometry.dispose(); this.scene.remove(p.tracerLine); }
      if (p.glowLine)   { p.glowLine.geometry.dispose();   this.scene.remove(p.glowLine); }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  private updateTracerGeo(
    geo:  THREE.BufferGeometry,
    tail: THREE.Vector3,
    head: THREE.Vector3,
    tailColor: { r: number; g: number; b: number },
    headColor: { r: number; g: number; b: number },
  ): void {
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, tail.x, tail.y, tail.z);
    posAttr.setXYZ(1, head.x, head.y, head.z);
    posAttr.needsUpdate = true;

    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    colAttr.setXYZ(0, tailColor.r, tailColor.g, tailColor.b);
    colAttr.setXYZ(1, headColor.r, headColor.g, headColor.b);
    colAttr.needsUpdate = true;
  }

  private setSprite(root: THREE.Object3D, name: string, fn: (s: THREE.Sprite) => void): void {
    const s = root.getObjectByName(name) as THREE.Sprite | undefined;
    if (s) fn(s);
  }

  // ── SMOKE ────────────────────────────────────

  /**
   * Each puff uses a canvas-generated radial-gradient texture so it looks
   * like a soft billowing cloud instead of a flat white square.
   *
   * Behaviour:
   *  - Spawns slightly offset from missile centre (turbulent drift)
   *  - Expands rapidly at first, then slows (sqrt easing)
   *  - Fades out with a smooth squared curve
   *  - Has a slight upward + sideways drift velocity
   *  - Rotates slowly for organic churn
   */
  private spawnSmokePuff(position: THREE.Vector3, forward: THREE.Vector3): void {
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up    = new THREE.Vector3().crossVectors(right, forward).normalize();

    // Turbulent spawn offset — keeps trail from looking like a laser beam
    position.addScaledVector(right, (Math.random() - 0.5) * 3.0);
    position.addScaledVector(up,    (Math.random() - 0.5) * 3.0);

    const tex = getSmokeTexture();
    const mat = new THREE.SpriteMaterial({
      map:         tex,
      transparent: true,
      opacity:     0.48 + Math.random() * 0.12,
      blending:    THREE.NormalBlending,
      depthWrite:  false,
      // Color tint — vary slightly between warm and cool grey
      color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.08, 0.82 + Math.random() * 0.12),
      rotation: Math.random() * Math.PI * 2,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);

    const initialScale = 5.0 + Math.random() * 4.0;
    sprite.scale.setScalar(initialScale);

    this.scene.add(sprite);

    // Drift: mostly upward + slight perpendicular component (hot exhaust rises)
    const drift = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      12 + Math.random() * 10,  // buoyancy — smoke rises
      (Math.random() - 0.5) * 8,
    );

    this.smokePuffs.push({
      sprite,
      life:          0,
      maxLife:       this.SMOKE_LIFE_MAX * (0.8 + Math.random() * 0.4),
      initialScale,
      rotationSpeed: (Math.random() - 0.5) * 0.8,
      velocity:      drift,
    });
  }

  private updateSmoke(delta: number): void {
    const toRemove: SmokePuff[] = [];

    for (const s of this.smokePuffs) {
      s.life += delta;
      const t = s.life / s.maxLife; // 0 → 1 normalised age

      // Drift position
      s.sprite.position.addScaledVector(s.velocity, delta);

      // Expand: fast at first (sqrt), then slows — natural billowing
      const expand = Math.sqrt(t);
      s.sprite.scale.setScalar(s.initialScale + expand * 30);

      // Rotate for turbulent churn
      (s.sprite.material as THREE.SpriteMaterial).rotation += s.rotationSpeed * delta;

      // Fade: linear in, squared out for a natural lingering trail
      let opacity: number;
      if (t < 0.12) {
        // Quick fade IN (prevent pop-on at birth)
        opacity = (t / 0.12) * 0.46;
      } else {
        // Slow fade out — squared so it lingers, then vanishes cleanly
        const fadeT = (t - 0.12) / (1 - 0.12);
        opacity = 0.46 * (1 - fadeT * fadeT);
      }
      (s.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, opacity);

      if (t >= 1) {
        this.scene.remove(s.sprite);
        s.sprite.material.dispose();
        toRemove.push(s);
      }
    }

    this.smokePuffs = this.smokePuffs.filter((s) => !toRemove.includes(s));
  }
  public getProjectiles() { return this.projectiles; }
}