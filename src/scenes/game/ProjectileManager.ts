import * as THREE from 'three';

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
export type ProjectileKind = 'bullet' | 'missile';

// Public interface kept for CombatSystem compatibility
export interface Projectile {
  kind:    ProjectileKind;
  mesh:    THREE.Object3D;
  alive:   boolean;
  slot?:   number;          // bullets only — index into InstancedMesh
}

// ─────────────────────────────────────────────
//  Module-level reusable objects
//  ✅ ZERO new() in any hot path — all scratch objects live here
// ─────────────────────────────────────────────
const _v3a  = new THREE.Vector3();
const _v3b  = new THREE.Vector3();
const _v3c  = new THREE.Vector3();
const _v3d  = new THREE.Vector3();   // used in getProjectiles() shim
const _quat = new THREE.Quaternion();
const _mat4 = new THREE.Matrix4();
const _one  = new THREE.Vector3(1, 1, 1);
const _fwd  = new THREE.Vector3(0, 0, -1);
const _up   = new THREE.Vector3(0, 1, 0);

// ─────────────────────────────────────────────
//  Smoke canvas texture — 64 px, one instance ever
// ─────────────────────────────────────────────
let _smokeTexture: THREE.CanvasTexture | null = null;

function getSmokeTexture(): THREE.CanvasTexture {
  if (_smokeTexture) return _smokeTexture;

  const SIZE   = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = SIZE / 2, r = SIZE / 2;

  const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, r);
  g.addColorStop(0.00, 'rgba(230,228,224,1.0)');
  g.addColorStop(0.30, 'rgba(210,208,205,0.85)');
  g.addColorStop(0.65, 'rgba(185,183,180,0.40)');
  g.addColorStop(1.00, 'rgba(160,158,155,0.00)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.fill();

  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.55;
    const bx = cx + Math.cos(a) * d, by = cx + Math.sin(a) * d;
    const br = r * (0.08 + Math.random() * 0.18), al = 0.06 + Math.random() * 0.10;
    const lu = Math.floor(200 + Math.random() * 30);
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bg.addColorStop(0, `rgba(${lu},${lu},${lu},${al})`);
    bg.addColorStop(1, `rgba(${lu},${lu},${lu},0)`);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  }

  _smokeTexture = new THREE.CanvasTexture(canvas);
  _smokeTexture.needsUpdate = true;
  return _smokeTexture;
}

// ─────────────────────────────────────────────
//  Missile shared assets (geometries + materials)
//  ✅ Created once, shared across all missile instances — no re-allocation
// ─────────────────────────────────────────────
interface MissileAssets {
  bodyGeo: THREE.CylinderGeometry; nosGeo: THREE.ConeGeometry;
  domGeo:  THREE.SphereGeometry;   rngGeo: THREE.TorusGeometry;
  finGeo:  THREE.BoxGeometry;      nzlGeo: THREE.CylinderGeometry;
  bodyMat: THREE.MeshStandardMaterial; nosMat: THREE.MeshStandardMaterial;
  domMat:  THREE.MeshStandardMaterial; rngMat: THREE.MeshStandardMaterial;
  finMat:  THREE.MeshStandardMaterial; nzlMat: THREE.MeshStandardMaterial;
}

let _missileAssets: MissileAssets | null = null;

function getMissileAssets(): MissileAssets {
  if (_missileAssets) return _missileAssets;

  const bodyGeo = new THREE.CylinderGeometry(0.38, 0.30, 8.0, 8);
  bodyGeo.rotateX(Math.PI / 2);

  const nosGeo = new THREE.ConeGeometry(0.38, 3.2, 8);
  nosGeo.rotateX(Math.PI / 2); nosGeo.translate(0, 0, -5.6);

  const domGeo = new THREE.SphereGeometry(0.22, 6, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  domGeo.rotateX(-Math.PI / 2); domGeo.translate(0, 0, -7.2);

  const rngGeo = new THREE.TorusGeometry(0.40, 0.055, 6, 12);
  rngGeo.rotateX(Math.PI / 2);

  const finGeo = new THREE.BoxGeometry(4.2, 0.06, 1.8);

  const nzlGeo = new THREE.CylinderGeometry(0.34, 0.28, 0.6, 8);
  nzlGeo.rotateX(Math.PI / 2);

  _missileAssets = {
    bodyGeo, nosGeo, domGeo, rngGeo, finGeo, nzlGeo,
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x8a9eae, metalness: 0.88, roughness: 0.22 }),
    nosMat:  new THREE.MeshStandardMaterial({ color: 0x2e4050, metalness: 0.92, roughness: 0.18 }),
    domMat:  new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.1,  roughness: 0.05, transparent: true, opacity: 0.7 }),
    rngMat:  new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.6,  roughness: 0.3,  emissive: 0xffaa00, emissiveIntensity: 0.3 }),
    finMat:  new THREE.MeshStandardMaterial({ color: 0x607080, metalness: 0.75, roughness: 0.35 }),
    nzlMat:  new THREE.MeshStandardMaterial({ color: 0x111820, metalness: 0.97, roughness: 0.08 }),
  };
  return _missileAssets;
}

function buildMissileMesh(): THREE.Group {
  const a = getMissileAssets();
  const g = new THREE.Group();

  g.add(new THREE.Mesh(a.bodyGeo, a.bodyMat));
  g.add(new THREE.Mesh(a.nosGeo,  a.nosMat));
  g.add(new THREE.Mesh(a.domGeo,  a.domMat));

  const ring = new THREE.Mesh(a.rngGeo, a.rngMat);
  ring.position.set(0, 0, -1.0);
  g.add(ring);

  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(a.finGeo, a.finMat);
    fin.rotation.z = (i * Math.PI) / 2;
    fin.position.set(0, 0, 3.2);
    g.add(fin);
  }

  const nzl = new THREE.Mesh(a.nzlGeo, a.nzlMat);
  nzl.position.set(0, 0, 4.3);
  g.add(nzl);

  const mkS = (color: number, op: number, sx: number, sy: number, z: number, name: string) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      color, transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.set(sx, sy, 1); s.position.set(0, 0, z); s.name = name;
    g.add(s);
  };
  mkS(0xffffff, 0.95, 1.4, 1.4, 5.0, 'exhaustCore');
  mkS(0xff7722, 0.80, 2.8, 2.8, 5.8, 'exhaustMid');
  mkS(0xff9900, 0.40, 5.5, 5.5, 6.5, 'exhaustOuter');
  mkS(0xff4400, 0.25, 2.2, 9.0, 8.5, 'flameTail');

  return g;
}

// ─────────────────────────────────────────────
//  Missile runtime struct (small — only ~10 per game)
// ─────────────────────────────────────────────
interface MissileEntry {
  mesh:       THREE.Group;
  vx: number; vy: number; vz: number;   // flat velocity — no Vector3 object
  life:       number;
  maxLife:    number;
  smokeTimer: number;
}

// ─────────────────────────────────────────────
//  Smoke pool entry — flat struct, no nested objects
// ─────────────────────────────────────────────
interface SmokePuff {
  sprite:        THREE.Sprite;
  mat:           THREE.SpriteMaterial;
  life:          number;
  maxLife:       number;
  initialScale:  number;
  rotationSpeed: number;
  vx: number; vy: number; vz: number;   // flat drift — no Vector3 object
  inUse:         boolean;
}

// ─────────────────────────────────────────────
//  ProjectileManager
// ─────────────────────────────────────────────
const MAX_BULLETS    = 64;
const SMOKE_POOL_SZ  = 48;
const HIDDEN_MATRIX  = new THREE.Matrix4().makeTranslation(0, -9_999_999, 0);

export class ProjectileManager {

  // ══════════════════════════════════════════
  //  BULLETS — InstancedMesh + batched LineSegments
  //  All bullets = 1 Draw Call (mesh) + 2 Draw Calls (tracer core + glow)
  //  Total: 3 Draw Calls regardless of bullet count  ✅
  // ══════════════════════════════════════════

  private bulletMesh!:     THREE.InstancedMesh;   // 1 draw call for all bullet bodies

  // Batched tracers — ALL tracers in ONE geometry each
  private tracerCore!:     THREE.LineSegments;
  private tracerGlow!:     THREE.LineSegments;
  private tcPos!:          THREE.BufferAttribute; // tracer-core position
  private tcCol!:          THREE.BufferAttribute; // tracer-core color
  private tgPos!:          THREE.BufferAttribute; // tracer-glow position
  private tgCol!:          THREE.BufferAttribute; // tracer-glow color

  // Flat parallel arrays for bullet state — cache-friendly, zero GC pressure
  private readonly bAlive = new Uint8Array(MAX_BULLETS);
  private readonly bVx    = new Float32Array(MAX_BULLETS);
  private readonly bVy    = new Float32Array(MAX_BULLETS);
  private readonly bVz    = new Float32Array(MAX_BULLETS);
  private readonly bLife  = new Float32Array(MAX_BULLETS);
  private readonly bMaxL  = new Float32Array(MAX_BULLETS);
  private readonly bFree  = new Array<boolean>(MAX_BULLETS).fill(true);

  // ══════════════════════════════════════════
  //  MISSILES — individual Groups (max ~3 simultaneously)
  // ══════════════════════════════════════════
  private missiles: MissileEntry[] = [];

  // ══════════════════════════════════════════
  //  SMOKE — pool of pre-allocated Sprites
  // ══════════════════════════════════════════
  private smokePool: SmokePuff[] = [];

  // ══════════════════════════════════════════
  //  Config
  // ══════════════════════════════════════════
  private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || navigator.maxTouchPoints > 1;

  private readonly ssf:           number;
  private readonly BULLET_SPEED   = 4800;
  private readonly BULLET_LIFE    = 1.6;
  private readonly TRACER_LENGTH  = 400;
  private readonly MISSILE_SPEED  = 1800;
  private readonly MISSILE_ACCEL  = 220;
  private readonly MISSILE_LIFE   = 8.0;
  private readonly SMOKE_INTERVAL:number;
  private readonly SMOKE_LIFE_MAX: number;
  private readonly SMOKE_ENABLED:  boolean;

  private _frameT = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.ssf           = this.isMobile ? 1.0 : this.calcSSF();
    this.SMOKE_INTERVAL = this.isMobile ? 0.8  : 0.028;
    this.SMOKE_LIFE_MAX = this.isMobile ? 0.6  : 2.2;
    this.SMOKE_ENABLED  = !this.isMobile;

    this.buildBulletMesh();
    this.buildTracerBatch();
    this.buildSmokePool();
  }

  // ─────────────────────────────────────────
  //  Build helpers
  // ─────────────────────────────────────────

  private buildBulletMesh(): void {
    // Thin capsule — 4 radial segments is enough at game distances
    const geo = new THREE.CylinderGeometry(1.8, 1.8, 18, 4);
    geo.rotateX(Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xff7700, transparent: true, opacity: 0.92,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.bulletMesh = new THREE.InstancedMesh(geo, mat, MAX_BULLETS);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.frustumCulled = false;   // skip per-frame BVH recompute
    this.bulletMesh.count         = 0;

    for (let i = 0; i < MAX_BULLETS; i++) {
      this.bulletMesh.setMatrixAt(i, HIDDEN_MATRIX);
    }
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.bulletMesh);
  }

  private buildTracerBatch(): void {
    // 2 vertices per bullet (tail + head), so N = MAX_BULLETS * 2
    const N = MAX_BULLETS * 2;

    const mkLS = (opacity: number) => {
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const posA = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
      const colA = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
      posA.setUsage(THREE.DynamicDrawUsage);
      colA.setUsage(THREE.DynamicDrawUsage);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', posA);
      geo.setAttribute('color',    colA);
      geo.setDrawRange(0, 0);
      const ls = new THREE.LineSegments(geo, mat);
      ls.frustumCulled = false;
      this.scene.add(ls);
      return { ls, posA, colA };
    };

    const core = mkLS(1.0);
    this.tracerCore = core.ls;
    this.tcPos      = core.posA;
    this.tcCol      = core.colA;

    const glow = mkLS(0.35);
    this.tracerGlow = glow.ls;
    this.tgPos      = glow.posA;
    this.tgCol      = glow.colA;
  }

  private buildSmokePool(): void {
    if (!this.SMOKE_ENABLED) return;
    const tex = getSmokeTexture();
    for (let i = 0; i < SMOKE_POOL_SZ; i++) {
      const mat    = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0,
        blending: THREE.NormalBlending, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.scene.add(sprite);
      this.smokePool.push({
        sprite, mat, life: 0, maxLife: 1, initialScale: 5,
        rotationSpeed: 0, vx: 0, vy: 0, vz: 0, inUse: false,
      });
    }
  }

  // ─────────────────────────────────────────
  //  PUBLIC
  // ─────────────────────────────────────────

  public spawn(
    kind:         ProjectileKind,
    origin:       THREE.Vector3,
    direction:    THREE.Vector3,
    baseVelocity  = _v3a.set(0, 0, 0),
  ): void {
    if (kind === 'bullet') this.spawnBullet(origin, direction, baseVelocity);
    else                   this.spawnMissile(origin, direction, baseVelocity);
  }

  public update(delta: number): void {
    this._frameT = Date.now() * 0.001;
    this.updateBullets(delta);
    this.updateMissiles(delta);
    if (this.SMOKE_ENABLED) this.updateSmoke(delta);
  }

  public clearAll(): void {
    this.bAlive.fill(0);
    this.bFree.fill(true);
    this.bulletMesh.count = 0;
    for (let i = 0; i < MAX_BULLETS; i++) this.bulletMesh.setMatrixAt(i, HIDDEN_MATRIX);
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.tracerCore.geometry.setDrawRange(0, 0);
    this.tracerGlow.geometry.setDrawRange(0, 0);

    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.missiles = [];

    for (const s of this.smokePool) { s.inUse = false; s.sprite.visible = false; }
  }

  public dispose(): void {
    this.bulletMesh.geometry.dispose();
    (this.bulletMesh.material as THREE.Material).dispose();
    this.scene.remove(this.bulletMesh);

    this.tracerCore.geometry.dispose();
    (this.tracerCore.material as THREE.Material).dispose();
    this.scene.remove(this.tracerCore);

    this.tracerGlow.geometry.dispose();
    (this.tracerGlow.material as THREE.Material).dispose();
    this.scene.remove(this.tracerGlow);

    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.missiles = [];

    for (const s of this.smokePool) { this.scene.remove(s.sprite); s.mat.dispose(); }
    this.smokePool = [];

    _smokeTexture?.dispose();
    _smokeTexture = null;
  }

  // ─────────────────────────────────────────
  //  Spawn
  // ─────────────────────────────────────────

  private spawnBullet(origin: THREE.Vector3, dir: THREE.Vector3, base: THREE.Vector3): void {
    // Find free slot (O(n) but MAX_BULLETS=64 — negligible)
    let slot = -1;
    for (let i = 0; i < MAX_BULLETS; i++) { if (this.bFree[i]) { slot = i; break; } }
    if (slot < 0) return;

    this.bFree[slot]  = false;
    this.bAlive[slot] = 1;
    this.bLife[slot]  = this.BULLET_LIFE;
    this.bMaxL[slot]  = this.BULLET_LIFE;

    // ✅ Flat scalar store — zero Vector3 created
    this.bVx[slot] = dir.x * this.BULLET_SPEED + base.x;
    this.bVy[slot] = dir.y * this.BULLET_SPEED + base.y;
    this.bVz[slot] = dir.z * this.BULLET_SPEED + base.z;

    // Orient bullet body along velocity direction
    _quat.setFromUnitVectors(_fwd, dir);
    _mat4.compose(origin, _quat, _one);
    this.bulletMesh.setMatrixAt(slot, _mat4);
    if (slot >= this.bulletMesh.count) this.bulletMesh.count = slot + 1;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
  }

  private spawnMissile(origin: THREE.Vector3, dir: THREE.Vector3, base: THREE.Vector3): void {
    const mesh = buildMissileMesh();
    _quat.setFromUnitVectors(_fwd, dir);
    mesh.quaternion.copy(_quat);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    // ✅ velocity stored as flat scalars — one clone avoided per frame
    this.missiles.push({
      mesh,
      vx: dir.x * this.MISSILE_SPEED + base.x,
      vy: dir.y * this.MISSILE_SPEED + base.y,
      vz: dir.z * this.MISSILE_SPEED + base.z,
      life:       this.MISSILE_LIFE,
      maxLife:    this.MISSILE_LIFE,
      smokeTimer: 0,
    });
  }

  // ─────────────────────────────────────────
  //  Update bullets
  //  ✅ Full hot path — ZERO allocations, ZERO clone()
  // ─────────────────────────────────────────

  private updateBullets(delta: number): void {
    const ssf   = this.ssf;
    let   dirty = false;
    let   tIdx  = 0;  // tracer vertex pair index (each bullet = 2 vertices)

    const iMat = this.bulletMesh.instanceMatrix.array;

    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!this.bAlive[i]) continue;

      this.bLife[i] -= delta;

      if (this.bLife[i] <= 0) {
        this.bAlive[i] = 0;
        this.bFree[i]  = true;
        this.bulletMesh.setMatrixAt(i, HIDDEN_MATRIX);
        dirty = true;
        // Zero out tracer pair so dead slot doesn't leave ghost lines
        this.writeVert(this.tcPos, tIdx*2,   0,0,0);
        this.writeVert(this.tcPos, tIdx*2+1, 0,0,0);
        this.writeVert(this.tgPos, tIdx*2,   0,0,0);
        this.writeVert(this.tgPos, tIdx*2+1, 0,0,0);
        tIdx++;
        continue;
      }

      // ✅ Read+write position directly in instanceMatrix float array — no Object3D overhead
      const base = i * 16;
      const px = iMat[base+12] + this.bVx[i] * delta;
      const py = iMat[base+13] + this.bVy[i] * delta;
      const pz = iMat[base+14] + this.bVz[i] * delta;
      iMat[base+12] = px;
      iMat[base+13] = py;
      iMat[base+14] = pz;
      dirty = true;

      // ── Tracer geometry ──────────────────────
      const fade    = Math.min(1, this.bLife[i] / (this.bMaxL[i] * 0.60));
      const speed   = Math.sqrt(this.bVx[i]*this.bVx[i] + this.bVy[i]*this.bVy[i] + this.bVz[i]*this.bVz[i]);
      const trvl    = speed * (this.bMaxL[i] - this.bLife[i]);
      const streak  = Math.min(this.TRACER_LENGTH * ssf, trvl);

      // Normalise direction inline — no Vector3
      const inv = speed > 0 ? 1 / speed : 0;
      const dx = this.bVx[i] * inv;
      const dy = this.bVy[i] * inv;
      const dz = this.bVz[i] * inv;

      const v0 = tIdx * 2, v1 = v0 + 1;

      // Core: tail → head
      this.writeVert(this.tcPos, v0, px - dx*streak, py - dy*streak, pz - dz*streak);
      this.writeVert(this.tcPos, v1, px, py, pz);
      const tr = fade*0.55, tg = fade*0.35;
      const hr = Math.min(1, 1.5*fade), hg = Math.min(1, fade), hb = Math.min(1, 0.5*fade);
      this.writeCol(this.tcCol, v0, tr, tg, 0);
      this.writeCol(this.tcCol, v1, hr, hg, hb);

      // Glow: slightly longer
      const gl = streak * 1.3;
      this.writeVert(this.tgPos, v0, px - dx*gl, py - dy*gl, pz - dz*gl);
      this.writeVert(this.tgPos, v1, px, py, pz);
      this.writeCol(this.tgCol, v0, 0.8*fade, 0.30*fade, 0);
      this.writeCol(this.tgCol, v1, hr, hg, hb);

      tIdx++;
    }

    if (dirty) this.bulletMesh.instanceMatrix.needsUpdate = true;

    // Upload only the used portion of tracer buffers
    const drawV = tIdx * 2;
    this.tracerCore.geometry.setDrawRange(0, drawV);
    this.tracerGlow.geometry.setDrawRange(0, drawV);
    this.tcPos.needsUpdate = true; this.tcCol.needsUpdate = true;
    this.tgPos.needsUpdate = true; this.tgCol.needsUpdate = true;
  }

  // ─────────────────────────────────────────
  //  Update missiles
  //  ✅ velocity stored as flat scalars — no clone() in hot path
  // ─────────────────────────────────────────

  private updateMissiles(delta: number): void {
    const t = this._frameT;
    let wi  = 0; // writeIdx for in-place compaction

    for (let i = 0; i < this.missiles.length; i++) {
      const m = this.missiles[i];
      m.life -= delta;

      if (m.life <= 0) {
        this.scene.remove(m.mesh);
        continue;
      }

      // ✅ Normalise without clone: use _v3a as scratch
      const speed = Math.sqrt(m.vx*m.vx + m.vy*m.vy + m.vz*m.vz);
      const inv   = speed > 0 ? 1 / speed : 0;
      const dx = m.vx * inv, dy = m.vy * inv, dz = m.vz * inv;

      const accel = this.MISSILE_ACCEL * delta;
      m.vx += dx * accel;
      m.vy += dy * accel;
      m.vz += dz * accel;

      // ✅ setFromUnitVectors with _v3a scratch
      _v3a.set(dx, dy, dz);
      _quat.setFromUnitVectors(_fwd, _v3a);
      m.mesh.quaternion.copy(_quat);

      // Exhaust flicker
      const fl  = 0.82 + 0.36 * Math.sin(t * 42 + 1.7);
      const fls = 0.88 + 0.24 * Math.sin(t * 13);
      const flt = 0.75 + 0.50 * Math.sin(t * 7.5);
      this.updateExhaust(m.mesh, fl, fls, flt);

      if (this.SMOKE_ENABLED) {
        m.smokeTimer -= delta;
        if (m.smokeTimer <= 0) {
          m.smokeTimer = this.SMOKE_INTERVAL;
          this.spawnSmokePuff(m.mesh.position, dx, dy, dz);
        }
      }

      m.mesh.position.x += m.vx * delta;
      m.mesh.position.y += m.vy * delta;
      m.mesh.position.z += m.vz * delta;

      this.missiles[wi++] = m;
    }
    this.missiles.length = wi;
  }

  // ✅ Direct child index — faster than getObjectByName tree walk
  private updateExhaust(root: THREE.Object3D, fl: number, fls: number, flt: number): void {
    const c = root.children, n = c.length;
    if (n < 13) return;

    const core  = c[n-4] as THREE.Sprite;
    const mid   = c[n-3] as THREE.Sprite;
    const outer = c[n-2] as THREE.Sprite;
    const tail  = c[n-1] as THREE.Sprite;

    core.scale.setScalar(1.2 + 0.5 * fl);
    (core.material  as THREE.SpriteMaterial).opacity = 0.95 * fl;
    mid.scale.setScalar(2.4 + 1.0 * fls);
    (mid.material   as THREE.SpriteMaterial).opacity = 0.78 * fls;
    outer.scale.setScalar(4.8 + 2.0 * fls);
    (outer.material as THREE.SpriteMaterial).opacity = 0.38 * fls;
    tail.scale.set(2.0 + flt * 1.2, 8.0 + flt * 6.0, 1);
    (tail.material  as THREE.SpriteMaterial).opacity = 0.22 * flt;
  }

  // ─────────────────────────────────────────
  //  Smoke
  //  ✅ Flat drift fields (vx/vy/vz) — no Vector3 objects in SmokePuff
  // ─────────────────────────────────────────

  private spawnSmokePuff(
    pos: THREE.Vector3,
    fdx: number, fdy: number, fdz: number,   // forward direction (normalised)
  ): void {
    let slot: SmokePuff | null = null;
    for (const s of this.smokePool) { if (!s.inUse) { slot = s; break; } }
    if (!slot) return;

    // right = forward × up,   up2 = right × forward
    _v3b.set(fdy * _up.z - fdz * _up.y, fdz * _up.x - fdx * _up.z, fdx * _up.y - fdy * _up.x).normalize();
    _v3c.set(_v3b.y*fdz - _v3b.z*fdy, _v3b.z*fdx - _v3b.x*fdz, _v3b.x*fdy - _v3b.y*fdx).normalize();

    const rx = (Math.random() - 0.5) * 3.0, ry = (Math.random() - 0.5) * 3.0;
    slot.sprite.position.set(
      pos.x + _v3b.x*rx + _v3c.x*ry,
      pos.y + _v3b.y*rx + _v3c.y*ry,
      pos.z + _v3b.z*rx + _v3c.z*ry,
    );

    const sc = 5.0 + Math.random() * 4.0;
    slot.sprite.scale.setScalar(sc);

    slot.mat.opacity  = 0.48 + Math.random() * 0.12;
    slot.mat.rotation = Math.random() * Math.PI * 2;
    slot.mat.color.setHSL(0.08 + Math.random() * 0.06, 0.08, 0.82 + Math.random() * 0.12);
    slot.mat.needsUpdate = true;

    slot.inUse         = true;
    slot.sprite.visible = true;
    slot.life          = 0;
    slot.maxLife       = this.SMOKE_LIFE_MAX * (0.8 + Math.random() * 0.4);
    slot.initialScale  = sc;
    slot.rotationSpeed = (Math.random() - 0.5) * 0.8;
    slot.vx = (Math.random() - 0.5) * 8;
    slot.vy = 12 + Math.random() * 10;
    slot.vz = (Math.random() - 0.5) * 8;
  }

  private updateSmoke(delta: number): void {
    for (const s of this.smokePool) {
      if (!s.inUse) continue;

      s.life += delta;
      const t = s.life / s.maxLife;

      // ✅ Direct field arithmetic — no addScaledVector, no Vector3
      s.sprite.position.x += s.vx * delta;
      s.sprite.position.y += s.vy * delta;
      s.sprite.position.z += s.vz * delta;

      s.sprite.scale.setScalar(s.initialScale + Math.sqrt(t) * 30);
      s.mat.rotation += s.rotationSpeed * delta;

      const opacity = t < 0.12
        ? (t / 0.12) * 0.46
        : 0.46 * (1 - ((t - 0.12) / 0.88) ** 2);
      s.mat.opacity = Math.max(0, opacity);

      if (t >= 1) { s.inUse = false; s.sprite.visible = false; }
    }
  }

  // ─────────────────────────────────────────
  //  Inline buffer helpers — avoid method-call overhead in tight loops
  // ─────────────────────────────────────────

  private writeVert(attr: THREE.BufferAttribute, idx: number, x: number, y: number, z: number): void {
    const i = idx * 3;
    (attr.array as Float32Array)[i]   = x;
    (attr.array as Float32Array)[i+1] = y;
    (attr.array as Float32Array)[i+2] = z;
  }

  private writeCol(attr: THREE.BufferAttribute, idx: number, r: number, g: number, b: number): void {
    const i = idx * 3;
    (attr.array as Float32Array)[i]   = r;
    (attr.array as Float32Array)[i+1] = g;
    (attr.array as Float32Array)[i+2] = b;
  }

  private calcSSF(): number {
    const dim = Math.max(window.innerWidth, window.innerHeight);
    return Math.max(1.0, Math.sqrt(dim / 390));
  }

  // ─────────────────────────────────────────
  //  CombatSystem compatibility shim
  //
  //  CombatSystem calls getProjectiles() and reads proj.mesh.position
  //  to check hit distance against enemies.
  //
  //  ✅ We expose a lightweight view: bullets get a shared _v3d
  //     updated per-slot from instanceMatrix — no new Object3D.
  //  ✅ killBulletSlot() lets CombatSystem kill a bullet by slot index
  //     without needing to set proj.alive = false on a Projectile object.
  // ─────────────────────────────────────────

  public getProjectiles(): Projectile[] {
    const out: Projectile[] = [];
    const iMat = this.bulletMesh.instanceMatrix.array;

    for (let i = 0; i < MAX_BULLETS; i++) {
      if (!this.bAlive[i]) continue;
      // Re-use _v3d as a position proxy — CombatSystem only reads .position
      const base = i * 16;
      _v3d.set(iMat[base+12], iMat[base+13], iMat[base+14]);
      out.push({
        kind:  'bullet',
        mesh:  { position: _v3d } as unknown as THREE.Object3D,
        alive: true,
        slot:  i,
      });
    }

    for (const m of this.missiles) {
      out.push({ kind: 'missile', mesh: m.mesh, alive: true });
    }

    return out;
  }

  public checkHits(
  enemies: THREE.Object3D[],
  bulletHitR: number,
  missileHitR: number,
  delta: number,
  onHit: (enemy: THREE.Object3D, kind: 'bullet' | 'missile') => void,
): void {
  const iMat = this.bulletMesh.instanceMatrix.array;

  // ── Bullets ──────────────────────────────────────────
  // for (let i = 0; i < MAX_BULLETS; i++) {
  //   if (!this.bAlive[i]) continue;

  //   const base = i * 16;
  //   const px = iMat[base + 12];
  //   const py = iMat[base + 13];
  //   const pz = iMat[base + 14];

  //   for (const enemy of enemies) {
  //     if (enemy.userData.isDead) continue;

  //     const ex = enemy.position.x - px;
  //     const ey = enemy.position.y - py;
  //     const ez = enemy.position.z - pz;
  //     const distSq = ex * ex + ey * ey + ez * ez;

  //     if (distSq < bulletHitR * bulletHitR) {
  //       this.killBulletSlot(i);
  //       onHit(enemy, 'bullet');
  //       break; // رصاصة واحدة بتصيب عدو واحد بس
  //     }
  //   }
  // }
  // ── Bullets — Swept Sphere ────────────────────────────────────
for (let i = 0; i < MAX_BULLETS; i++) {
  if (!this.bAlive[i]) continue;
  // console.log(`bullet ${i} alive`);

  const base = i * 16;
  
  // مكان الرصاصة دلوقتي
  const px = iMat[base + 12];
  const py = iMat[base + 13];
  const pz = iMat[base + 14];

  // if (i === 10) console.log(`bullet pos: ${Math.round(px)}, ${Math.round(py)}, ${Math.round(pz)}`);

  // مكانها في الـ frame اللي فات (قبل الـ update)
  // بنحسبه بالعكس من الـ velocity
  const prevX = px - this.bVx[i] * delta;
  const prevY = py - this.bVy[i] * delta;
  const prevZ = pz - this.bVz[i] * delta;

  // اتجاه الحركة (الخط اللي اتحركته)
  const dx = px - prevX;
  const dy = py - prevY;
  const dz = pz - prevZ;
  const lenSq = dx*dx + dy*dy + dz*dz;

  for (const enemy of enemies) {
    if (enemy.userData.isDead) continue;

    // if (i === 10) console.log(`enemy pos: ${Math.round(enemy.position.x)}, ${Math.round(enemy.position.y)}, ${Math.round(enemy.position.z)}`);


    const ex = enemy.position.x;
    const ey = enemy.position.y;
    const ez = enemy.position.z;

    // أقرب نقطة على الخط للعدو
    let t = 0;
    if (lenSq > 0) {
      t = ((ex - prevX)*dx + (ey - prevY)*dy + (ez - prevZ)*dz) / lenSq;
      t = Math.max(0, Math.min(1, t)); // نخليه بين بداية ونهاية الـ frame بس
    }

    const cx = prevX + dx * t - ex;
    const cy = prevY + dy * t - ey;
    const cz = prevZ + dz * t - ez;
    const distSq = cx*cx + cy*cy + cz*cz;

    // console.log(`bullet dist=${Math.round(Math.sqrt(distSq))} hitR=${bulletHitR}`);

    if (distSq < bulletHitR * bulletHitR) {
      this.killBulletSlot(i);
      onHit(enemy, 'bullet');
      break;
    }
  }
}

  // ── Missiles ─────────────────────────────────────────
  for (const m of this.missiles) {
    for (const enemy of enemies) {
      if (enemy.userData.isDead) continue;

      const ex = enemy.position.x - m.mesh.position.x;
      const ey = enemy.position.y - m.mesh.position.y;
      const ez = enemy.position.z - m.mesh.position.z;
      const distSq = ex * ex + ey * ey + ez * ez;

      if (distSq < missileHitR * missileHitR) {
        m.life = 0; // هيتشال في الـ update الجاي
        // console.log(`HIT distSq=${Math.round(Math.sqrt(distSq))} hitR=${bulletHitR}`);
        onHit(enemy, 'missile');
        break;
      }
    }
  }
}

  /** Called by CombatSystem when a bullet hits an enemy. */
  public killBulletSlot(slot: number): void {
    if (slot < 0 || slot >= MAX_BULLETS) return;
    this.bAlive[slot] = 0;
    this.bFree[slot]  = true;
    this.bulletMesh.setMatrixAt(slot, HIDDEN_MATRIX);
    this.bulletMesh.instanceMatrix.needsUpdate = true;
  }
}