import * as THREE from 'three';
import { Cockpit } from './Cockpit';
import { EnemyManager } from './EnemyManager';
import { ProjectileManager } from './ProjectileManager';
import { NotificationSystem } from './NotificationSystem';

// ───────────────────────────────────────────────────────────────
//  HealthSystem  (self-contained — owns HUD DOM)
// ───────────────────────────────────────────────────────────────
class HealthSystem {
  public hp      = 100;
  public maxHp   = 100;
  public isDead  = false;

  public  shakeTimer      = 0;
  public  shakeIntensity  = 0;
  private readonly SHAKE_DURATION = 0.40;

  private cameraBasePos = new THREE.Vector3();
  private cameraBasePosSet = false;

  private hudFill:    HTMLElement;
  private hudLabel:   HTMLElement;
  private hitOverlay: HTMLElement;
  private deathEl:    HTMLElement;

  // ✅ Store callbacks as public properties so Engine can reassign them
  public onRestartCallback?: () => void;
  public onExitCallback?:    () => void;

  constructor(
    private cockpit: Cockpit,
    private onDeathCallback?: () => void,
    onRestartCallback?: () => void,
    onExitCallback?: () => void,
  ) {
    this.onRestartCallback = onRestartCallback;
    this.onExitCallback    = onExitCallback;
    this.buildHUD();
    this.hudFill    = document.getElementById('cs-hp-fill')!;
    this.hudLabel   = document.getElementById('cs-hp-label')!;
    this.hitOverlay = document.getElementById('cs-hit-overlay')!;
    this.deathEl    = document.getElementById('cs-death')!;
  }

  // ── Public ────────────────────────────────────────────────────

  public takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.refreshBar();
    this.flashScreen();
    this.shakeTimer     = this.SHAKE_DURATION;
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
    const t   = Math.max(0, this.shakeTimer / this.SHAKE_DURATION);
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

  // ✅ Full health reset — call this on replay
  public reset(): void {
    // Restore HP
    this.hp    = this.maxHp;
    this.isDead = false;

    // Stop any lingering shake
    this.shakeTimer     = 0;
    this.shakeIntensity = 0;
    this.cameraBasePosSet = false;

    // Restore camera position inside cockpit to base
    const model = this.cockpit.model;
    if (model && this.cameraBasePosSet) {
      const cam = model.children.find(c => c instanceof THREE.PerspectiveCamera) as THREE.PerspectiveCamera | undefined;
      if (cam) cam.position.copy(this.cameraBasePos);
    }

    // Refresh HP bar to 100%
    this.refreshBar();

    // Hide the death screen
    this.deathEl.classList.remove('cs-visible');
  }

  public dispose(): void {
    document.getElementById('cs-hud-root')?.remove();
  }

  // ── Private ───────────────────────────────────────────────────

  private refreshBar(): void {
    const pct = this.hp / this.maxHp;
    this.hudFill.style.width = `${pct * 100}%`;
    if (pct > 0.5) {
      this.hudFill.style.background = 'linear-gradient(90deg,#00c97a,#00ffcc)';
      this.hudLabel.style.color = '#00ffcc';
    } else if (pct > 0.25) {
      this.hudFill.style.background = 'linear-gradient(90deg,#c97a00,#ffcc00)';
      this.hudLabel.style.color = '#ffcc00';
    } else {
      this.hudFill.style.background = 'linear-gradient(90deg,#c90000,#ff4444)';
      this.hudLabel.style.color = '#ff4444';
    }
    this.hudLabel.textContent = `HULL  ${Math.round(pct * 100)}%`;
  }

  private flashScreen(): void {
    this.hitOverlay.style.opacity = '1';
    setTimeout(() => { this.hitOverlay.style.opacity = '0'; }, 100);
  }

  private onDeath(): void {
    this.isDead = true;
    this.deathEl.classList.add('cs-visible');
    this.shakeTimer     = 3.0;
    this.shakeIntensity = 0.0006;
    this.onDeathCallback?.();
  }

  private buildHUD(): void {
    document.getElementById('cs-hud-root')?.remove();
    const root = document.createElement('div');
    root.id = 'cs-hud-root';
    root.innerHTML = `
      <style>
        #cs-hud-root {
          position: fixed; top: 18px; left: 50%;
          transform: translateX(-50%);
          z-index: 999; pointer-events: none;
          display: flex; flex-direction: column;
          align-items: center; gap: 5px;
          visibility: hidden;
        }
        #cs-hp-label {
          font-family: 'Courier New', monospace; font-size: 11px;
          letter-spacing: 3px; color: #00ffcc; text-shadow: 0 0 8px #00ffcc88;
        }
        #cs-hp-bar { width: 240px; height: 9px; background: rgba(0,0,0,0.5); border: 1px solid rgba(0,255,180,0.3); border-radius: 2px; overflow: hidden; }
        #cs-hp-fill { height: 100%; width: 100%; background: linear-gradient(90deg,#00c97a,#00ffcc); transition: width 0.12s ease; }

        #cs-hit-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.35) 100%);
          pointer-events: none; opacity: 0; transition: opacity 0.15s ease;
        }

        #cs-death {
          position: fixed; inset: 0; z-index: 10001;
          display: none;
          align-items: center; justify-content: center;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          pointer-events: all;
          opacity: 0; transition: opacity 0.8s ease;
        }
        #cs-death.cs-visible { display: flex; opacity: 1; }

        #cs-death-modal {
          display: flex; flex-direction: column; align-items: center; gap: 24px;
          padding: 48px 64px; background: rgba(8, 10, 18, 0.95);
          border: 1px solid rgba(255, 34, 34, 0.4); border-radius: 4px;
          box-shadow: 0 0 60px rgba(255,0,0,0.2);
        }
        #cs-death-title { font-family: 'Courier New', monospace; font-size: 42px; color: #ff2222; letter-spacing: 10px; margin:0; }

        .cs-btn {
          font-family: 'Courier New', monospace; padding: 12px 36px;
          background: transparent; border: 1px solid; border-radius: 2px;
          cursor: pointer; width: 220px; letter-spacing: 2px; transition: all 0.2s;
        }
        #cs-btn-retry { color: #00ffcc; border-color: rgba(0,255,180,0.5); }
        #cs-btn-retry:hover { background: rgba(0,255,180,0.15); box-shadow: 0 0 15px rgba(0,255,180,0.3); }
        #cs-btn-exit { color: #aaa; border-color: #444; }
        #cs-btn-exit:hover { background: rgba(255,255,255,0.1); color: #fff; }
      </style>

      <div id="cs-hp-label">HULL 100%</div>
      <div id="cs-hp-bar"><div id="cs-hp-fill"></div></div>
      <div id="cs-hit-overlay"></div>

      <div id="cs-death">
        <div id="cs-death-modal">
          <div id="cs-death-title">DESTROYED</div>
          <div id="cs-death-sub" style="color:rgba(255,255,255,0.4); font-size:12px; letter-spacing:3px;">MISSION FAILED</div>
          <div id="cs-btn-row" style="display:flex; flex-direction:column; gap:12px;">
            <button class="cs-btn" id="cs-btn-retry">↺ RETRY MISSION</button>
            <button class="cs-btn" id="cs-btn-exit">⎋ EXIT TO MENU</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // ✅ Buttons always read the latest callback from the instance property
    document.getElementById('cs-btn-retry')?.addEventListener('click', () => {
      console.log('Restarting...');
      this.onRestartCallback?.();
    });
    document.getElementById('cs-btn-exit')?.addEventListener('click', () => {
      console.log('Exiting...');
      this.onExitCallback?.();
    });
  }
}


// ───────────────────────────────────────────────────────────────
//  Enemy projectile (visual + physics)
// ───────────────────────────────────────────────────────────────
interface EnemyShot {
  mesh:      THREE.Object3D;
  velocity:  THREE.Vector3;
  life:      number;
  isMissile: boolean;
  owner:     THREE.Object3D;
}

// ✅ في أول الـ class — أضف الـ interfaces دي
interface FallingEnemy {
  obj:      THREE.Object3D;
  elapsed:  number;
  duration: number;
  fallSpeed: number;
  spinSpeed: number;
}

interface ExplosionParticle {
  sprite:    THREE.Sprite;
  mat:       THREE.SpriteMaterial;
  elapsed:   number;
  duration:  number;
  startSize: number;
  opacity:   number;
}

// ✅ أضف فوق الـ class
interface PooledBullet {
  group:   THREE.Group;
  glow:    THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  tail:    THREE.Line;
  tailMat: THREE.LineBasicMaterial;
  inUse:   boolean;
}

interface PooledMissile {
  group:      THREE.Group;
  glow:       THREE.Sprite;
  glowMat:    THREE.SpriteMaterial;
  exhaust:    THREE.Sprite;
  exhaustMat: THREE.SpriteMaterial;
  inUse:      boolean;
}


// ───────────────────────────────────────────────────────────────
//  CombatSystem
// ───────────────────────────────────────────────────────────────
export class CombatSystem {

  public readonly health: HealthSystem;

  private readonly ENGAGE_DIST        = 120_000;
  private readonly BULLET_SPEED       = 12_000;
  private readonly MISSILE_SPEED      =  5_000;
  private readonly BULLET_LIFE        = 10.0;
  private readonly MISSILE_LIFE       = 12.0;
  private readonly BULLET_DAMAGE      = 3;
  private readonly MISSILE_DAMAGE     = 10;
  private readonly HIT_R_BULLET       = 500;
  private readonly HIT_R_MISSILE      = 500;
  private readonly SHOOT_INTERVAL_MIN = 2.0;
  private readonly SHOOT_INTERVAL_MAX = 5.0;

  private readonly PLAYER_BULLET_DMG   = 12;
  private readonly PLAYER_MISSILE_DMG  = 40;

  // private readonly ENEMY_HIT_R_BULLET  = 200;
  // private readonly ENEMY_HIT_R_MISSILE = 550;
  private readonly ENEMY_HIT_R_BULLET  = 500;
  private readonly ENEMY_HIT_R_MISSILE = 600;


  private readonly bulletGeo:   THREE.CylinderGeometry;
  private readonly bulletMat:   THREE.MeshBasicMaterial;
  private readonly missileBody: THREE.CylinderGeometry;
  private readonly missileMat:  THREE.MeshBasicMaterial;
  private readonly missileGlow: THREE.SpriteMaterial;

  private shots:         EnemyShot[] = [];
  private cooldowns      = new Map<string, number>();
  private shootIntervals = new Map<string, number>();

  private fallingEnemies:    FallingEnemy[]      = [];
  private explosionParticles: ExplosionParticle[] = [];

  // ✅ أضف مع باقي المتغيرات
  private bulletPool:  PooledBullet[]  = [];
  private missilePool: PooledMissile[] = [];

  private readonly BULLET_POOL_SIZE  = 40;
  private readonly MISSILE_POOL_SIZE = 10;

  // ✅ في أول الـ class — أضف ثابت واحد بس
  private readonly ENEMY_HIT_RADIUS_SQ_BULLET  = 500 * 500;   // مربع المسافة — بنتجنب sqrt
  private readonly ENEMY_HIT_RADIUS_SQ_MISSILE = 600 * 600;

  // ✅ reusable vector — مش بنعمل new كل frame (ده جزء من مشكلة ⑤ كمان)
  private readonly _diffVec = new THREE.Vector3();

  constructor(
    private scene:             THREE.Scene,
    private camera:            THREE.PerspectiveCamera,
    private cockpit:           Cockpit,
    private enemyManager:      EnemyManager,
    private projectileManager: ProjectileManager,
    private notifications:     NotificationSystem,
    private onRestartCallback?: () => void,
    private onExitCallback?:    () => void,
  ) {
    this.health = new HealthSystem(
      cockpit,
      () => {
        this.notifications.show({
          type:     'warn',
          title:    'SHIP DESTROYED',
          msg:      'Hull integrity lost — mission failed',
          duration: 8000,
        });
      },
      onRestartCallback,
      onExitCallback,
    );

    this.bulletGeo  = new THREE.CylinderGeometry(2.5, 2.5, 28, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat  = new THREE.MeshBasicMaterial({ color: 0xff5500 });

    this.missileBody = new THREE.CylinderGeometry(5, 5, 70, 8);
    this.missileBody.rotateX(Math.PI / 2);
    this.missileMat  = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    this.missileGlow = new THREE.SpriteMaterial({
      color:       0xff4400,
      transparent: true,
      opacity:     0.55,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });
    this.initPools();
  }

  // ✅ دالة جديدة — اعمل كل الـ meshes مرة واحدة عند البداية
private initPools(): void {
  // ── Bullet pool ──────────────────────────────────────
  const tailGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 14),
    new THREE.Vector3(0, 0, 55),
  ]);

  for (let i = 0; i < this.BULLET_POOL_SIZE; i++) {
    const group = new THREE.Group();

    const core = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    group.add(core);

    const glowMat = new THREE.SpriteMaterial({
      color: 0xff7722, transparent: true, opacity: 0.70,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(18, 18, 1);
    group.add(glow);

    const tailMat = new THREE.LineBasicMaterial({
      color: 0xff8844, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const tail = new THREE.Line(tailGeo, tailMat);
    group.add(tail);

    group.visible = false;  // مخفي لحد ما يتستخدم
    this.bulletPool.push({ group, glow, glowMat, tail, tailMat, inUse: false });
  }

  // ── Missile pool ─────────────────────────────────────
  for (let i = 0; i < this.MISSILE_POOL_SIZE; i++) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(this.missileBody, this.missileMat);
    group.add(body);

    const glowMat = new THREE.SpriteMaterial({
      color: 0xff4400, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(50, 50, 1);
    group.add(glow);

    const exhaustMat = new THREE.SpriteMaterial({
      color: 0xffaa00, transparent: true, opacity: 0.40,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const exhaust = new THREE.Sprite(exhaustMat);
    exhaust.scale.set(22, 80, 1);
    exhaust.position.set(0, 0, 45);
    group.add(exhaust);

    group.visible = false;
    this.missilePool.push({ group, glow, glowMat, exhaust, exhaustMat, inUse: false });
  }

  // ✅ أضف كل الـ pool objects للـ scene مرة واحدة
  for (const b of this.bulletPool)  this.scene.add(b.group);
  for (const m of this.missilePool) this.scene.add(m.group);
}

  // ── Public update — call from Engine.animate() ────────────────

  public showHUD(): void {
    const root = document.getElementById('cs-hud-root');
    if (root) root.style.visibility = 'visible';
  }

  public hideHUD(): void {
    const root = document.getElementById('cs-hud-root');
    if (root) root.style.visibility = 'hidden';
  }

  // ✅ Full combat reset — called by Engine.resetForReplay()
  public reset(): void {
    // 1. Remove all in-flight enemy shots from the scene
    for (const s of this.shots) {
      this.scene.remove(s.mesh);
    }
    this.shots = [];

    // 2. Clear all per-enemy shoot timers so enemies don't immediately volley
    this.cooldowns.clear();
    this.shootIntervals.clear();

    // 3. Reset player health to 100 and hide the death screen
    this.health.reset();

    // 4. Make sure HUD is visible and fresh
    this.showHUD();
  }

  public update(delta: number): void {
    this.health.update(delta);
    if (this.health.isDead) return;

    const cockpitPos = new THREE.Vector3();
    this.camera.getWorldPosition(cockpitPos);

    this.updateEnemyShooting(delta, cockpitPos);
    this.updateEnemyShots(delta, cockpitPos);
    this.checkPlayerShotsHitEnemies();

    this.updateFallingEnemies(delta);   // ✅ أضف دي
    this.updateExplosions(delta); 
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

    this.explosionParticles = [];
    this.fallingEnemies     = [];

    for (const b of this.bulletPool) {
      this.scene.remove(b.group);
      b.glowMat.dispose();
      b.tailMat.dispose();
    }
    for (const m of this.missilePool) {
      this.scene.remove(m.group);
      m.glowMat.dispose();
      m.exhaustMat.dispose();
    }
    this.bulletPool  = [];
    this.missilePool = [];
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

  // private fireEnemyShot(
  //   enemy:      THREE.Object3D,
  //   targetPos:  THREE.Vector3,
  //   dist:       number,
  // ): void {
  //   const origin = enemy.position.clone();

  //   // Predictive lead: where will the player be when bullet arrives?
  //   const travelTime = dist / this.BULLET_SPEED;
  //   const playerFwd  = this.cockpit.model
  //     ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.cockpit.model.quaternion)
  //     : new THREE.Vector3();
  //   const speed      = this.cockpit.currentSpeed ?? 255;
  //   // const aimPos     = targetPos.clone().addScaledVector(playerFwd, speed * travelTime * 0.55);
  //   // const playerVelocity = this.cockpit.getVelocityVector(); // متجه حقيقي (x, y, z)
  //   const playerVelocity = playerFwd.multiplyScalar(speed);
  //   const aimPos = targetPos.clone().addScaledVector(playerVelocity, travelTime);

  //   // عشان متخليش العدو "أسطوري" وميغلطش أبدًا، ضيف شوية عشوائية بعد الحساب الصح
  //   const errorMargin = 0.02;
  //   aimPos.x += (Math.random() - 0.5) * dist * errorMargin;


  //   const spread = 0.04;
  //   const dir    = aimPos.sub(origin).normalize();
  //   dir.x += (Math.random() - 0.5) * spread;
  //   dir.y += (Math.random() - 0.5) * spread;
  //   dir.normalize();

  //   const isMissile = dist < 40_000 && Math.random() < 0.20;

  //   // Build visible mesh
  //   const mesh = isMissile
  //     ? this.buildMissileMesh(dir)
  //     : this.buildBulletMesh(dir);
  //   mesh.position.copy(origin);
  //   this.scene.add(mesh);

  //   this.shots.push({
  //     mesh,
  //     velocity: dir.clone().multiplyScalar(isMissile ? this.MISSILE_SPEED : this.BULLET_SPEED),
  //     life:     isMissile ? this.MISSILE_LIFE : this.BULLET_LIFE,
  //     isMissile,
  //     owner:    enemy,
  //   });

  //   // console.log(`🔫 Enemy fired ${isMissile ? 'MISSILE' : 'bullet'} | dist: ${Math.round(dist)}`);
  // }
  private fireEnemyShot(enemy: THREE.Object3D, targetPos: THREE.Vector3, dist: number): void {
  const origin = enemy.position.clone();

  const travelTime     = dist / this.BULLET_SPEED;
  const playerFwd      = this.cockpit.model
    ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.cockpit.model.quaternion)
    : new THREE.Vector3();
  const speed          = this.cockpit.currentSpeed ?? 255;
  const playerVelocity = playerFwd.multiplyScalar(speed);
  const aimPos         = targetPos.clone().addScaledVector(playerVelocity, travelTime);

  aimPos.x += (Math.random() - 0.5) * dist * 0.02;

  const dir = aimPos.sub(origin).normalize();
  dir.x += (Math.random() - 0.5) * 0.04;
  dir.y += (Math.random() - 0.5) * 0.04;
  dir.normalize();

  const isMissile = dist < 40_000 && Math.random() < 0.20;

  // ✅ بدل buildBulletMesh / buildMissileMesh
  let mesh: THREE.Object3D | null = null;

  if (isMissile) {
    const pooled = this.acquireMissile();
    if (!pooled) return;  // الـ pool اتملا — skip
    pooled.group.position.copy(origin);
    pooled.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    mesh = pooled.group;
  } else {
    const pooled = this.acquireBullet();
    if (!pooled) return;
    pooled.group.position.copy(origin);
    pooled.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    mesh = pooled.group;
  }

  this.shots.push({
    mesh,
    velocity:  dir.clone().multiplyScalar(isMissile ? this.MISSILE_SPEED : this.BULLET_SPEED),
    life:      isMissile ? this.MISSILE_LIFE : this.BULLET_LIFE,
    isMissile,
    owner:     enemy,
  });
}

  // ── Enemy shot visuals ────────────────────────────────────────

  // ✅ بدل buildBulletMesh — بتاخد من الـ pool بدل ما تعمل new
private acquireBullet(): PooledBullet | null {
  for (const b of this.bulletPool) {
    if (!b.inUse) {
      b.inUse = true;
      b.group.visible = true;
      b.glowMat.opacity = 0.70;
      return b;
    }

  }
  return null;  // الـ pool اتملا — مش بنعمل new، بنتجاهل الرصاصة
}

// ✅ بدل buildMissileMesh
private acquireMissile(): PooledMissile | null {
  for (const m of this.missilePool) {
    if (!m.inUse) {
      m.inUse = true;
      m.group.visible = true;
      m.glowMat.opacity = 0.55;
      m.exhaustMat.opacity = 0.40;
      return m;
    }

  }
  return null;
}
  // private buildBulletMesh(dir: THREE.Vector3): THREE.Object3D {
  //   const group = new THREE.Group();

  //   // Core capsule
  //   const core = new THREE.Mesh(this.bulletGeo, this.bulletMat);
  //   group.add(core);

  //   // Additive glow sprite so it's visible from far away
  //   const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  //     color:      0xff7722,
  //     transparent: true,
  //     opacity:    0.70,
  //     blending:   THREE.AdditiveBlending,
  //     depthWrite: false,
  //   }));
  //   glow.scale.set(18, 18, 1);
  //   group.add(glow);

  //   // Tracer tail — thin line behind bullet
  //   const tailGeo = new THREE.BufferGeometry().setFromPoints([
  //     new THREE.Vector3(0, 0, 14),
  //     new THREE.Vector3(0, 0, 55),
  //   ]);
  //   const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({
  //     color:      0xff8844,
  //     transparent: true,
  //     opacity:    0.65,
  //     blending:   THREE.AdditiveBlending,
  //     depthWrite: false,
  //   }));
  //   group.add(tail);

  //   group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  //   return group;
  // }

  // private buildMissileMesh(dir: THREE.Vector3): THREE.Object3D {
  //   const group = new THREE.Group();

  //   const body = new THREE.Mesh(this.missileBody, this.missileMat);
  //   group.add(body);

  //   // Larger glow
  //   const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  //     color:      0xff4400,
  //     transparent: true,
  //     opacity:    0.55,
  //     blending:   THREE.AdditiveBlending,
  //     depthWrite: false,
  //   }));
  //   glow.scale.set(50, 50, 1);
  //   group.add(glow);

  //   // Exhaust flare behind
  //   const exhaust = new THREE.Sprite(new THREE.SpriteMaterial({
  //     color:      0xffaa00,
  //     transparent: true,
  //     opacity:    0.40,
  //     blending:   THREE.AdditiveBlending,
  //     depthWrite: false,
  //   }));
  //   exhaust.scale.set(22, 80, 1);
  //   exhaust.position.set(0, 0, 45);
  //   group.add(exhaust);

  //   group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  //   return group;
  // }

  // ── Update flying shots + hit player ─────────────────────────

  private updateEnemyShots(delta: number, cockpitPos: THREE.Vector3): void {
    const dead: EnemyShot[] = [];
    const t = Date.now() * 0.001;

    for (const s of this.shots) {
      s.life -= delta;
      if (s.life <= 0) { dead.push(s); continue; }

      s.mesh.position.addScaledVector(s.velocity, delta);

      const dir = s.velocity.clone().normalize();
      s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);

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

        this.notifications.show({
          type:     s.isMissile ? 'warn' : 'info',
          title:    s.isMissile ? 'MISSILE IMPACT' : 'HULL BREACH',
          msg:      `−${dmg} integrity  ·  ${Math.round(this.health.hp)}% remaining`,
          duration: 3000,
        });
      }
    }

    // for (const s of dead) {
    //   this.scene.remove(s.mesh);
    //   this.shots = this.shots.filter(x => x !== s);
    // }
    for (const s of dead) {
      // ✅ رجّع للـ pool بدل ما تشيله من الـ scene
      s.mesh.visible = false;

      // ارجع للـ pool
      const bullet = this.bulletPool.find(b => b.group === s.mesh);
      if (bullet) { bullet.inUse = false; }
      const missile = this.missilePool.find(m => m.group === s.mesh);
      if (missile) { missile.inUse = false; }

      this.shots = this.shots.filter(x => x !== s);
    }
  }


private updateFallingEnemies(delta: number): void {
  const done: FallingEnemy[] = [];

  for (const f of this.fallingEnemies) {
    f.elapsed += delta;
    const t = f.elapsed / f.duration;

    f.obj.position.y -= f.fallSpeed * delta;
    f.obj.rotation.z += f.spinSpeed * delta;
    f.obj.rotation.x += f.spinSpeed * 0.5 * delta;

    const scale = Math.max(0, f.obj.scale.x * (1 - 0.3 * delta));
    f.obj.scale.setScalar(scale);

    if (t >= 1) {
      this.enemyManager.removeEnemy(f.obj);
      done.push(f);
    }
  }

  for (const f of done) {
    this.fallingEnemies.splice(this.fallingEnemies.indexOf(f), 1);
  }
}

private updateExplosions(delta: number): void {
  const done: ExplosionParticle[] = [];

  for (const p of this.explosionParticles) {
    p.elapsed += delta;
    const t = p.elapsed / p.duration;   // 0 → 1

    if (t >= 1) {
      this.scene.remove(p.sprite);
      p.mat.dispose();
      done.push(p);
      continue;
    }

    const eased = 1 - Math.pow(1 - t, 2);
    p.sprite.scale.setScalar(p.startSize * eased);
    p.mat.opacity = p.opacity * (1 - t * t);
  }

  for (const p of done) {
    this.explosionParticles.splice(this.explosionParticles.indexOf(p), 1);
  }
}

  // ── Player shots hitting enemies ──────────────────────────────

  // private checkPlayerShotsHitEnemies(): void {
  //   // Access internal list via any — or add getProjectiles() to ProjectileManager
  //   const projs = (this.projectileManager as any).projectiles as Array<{
  //     kind:  string;
  //     mesh:  THREE.Object3D;
  //     alive: boolean;
  //   }> | undefined;
  //   if (!projs) return;

  //   for (const enemy of this.enemyManager.getEnemies()) {
  //     // Init HP on userData if not set
  //     if (enemy.userData.hp === undefined) {
  //       enemy.userData.hp = 1;
  //     }

  //     for (const proj of projs) {
  //       if (!proj.alive) continue;

  //       const dist = proj.mesh.position.distanceTo(enemy.position);
  //       const hitR = proj.kind === 'missile' ? this.ENEMY_HIT_R_MISSILE : this.ENEMY_HIT_R_BULLET;

  //       if (dist < hitR) {
  //         proj.alive = false;
  //         const dmg  = proj.kind === 'missile' ? this.PLAYER_MISSILE_DMG : this.PLAYER_BULLET_DMG;
  //         enemy.userData.hp -= dmg;
          
  //         console.log(`💥 HIT! dist=${Math.round(dist)} hitR=${hitR} dmg=${dmg} hp=${enemy.userData.hp}`);
  //         // Hit flash
  //         this.flashEnemy(enemy, 0.15);

  //         // console.log(`💥 Enemy hit -${dmg} HP → ${enemy.userData.hp}`);

  //         if (enemy.userData.hp <= 0) {
  //           this.explodeAndRemove(enemy);
  //         }
  //       }
  //     }
  //   }
  // }
  // private checkPlayerShotsHitEnemies(): void {
  //   const projs = (this.projectileManager as any).projectiles;
  //   if (!projs) return;

  //   for (const proj of projs) {
  //     if (!proj.alive) continue;

  //     for (const enemy of this.enemyManager.getEnemies()) {
  //       if (enemy.userData.isDead) continue;

  //       // 1. تحديث مكان الـ Hitbox ليكون مطابقاً لمكان الطيارة الحالي
  //       const hitbox = enemy.userData.hitbox as THREE.Box3;
  //       // hitbox.setFromObject(enemy); 
  //       hitbox.setFromCenterAndSize(enemy.position, new THREE.Vector3(300, 300, 300));
        
  //       // اختياري: توسيع الصندوق حاجة بسيطة جداً لو الطيارة موديلها رفيع
  //       hitbox.expandByScalar(50); 

  //       // 2. التشيك: هل موقع الرصاصة الحالي داخل الصندوق؟[cite: 1]
  //       if (hitbox.containsPoint(proj.mesh.position)) {
  //         proj.alive = false; 
  //         enemy.userData.hp = 0; 
          
  //         this.flashEnemy(enemy, 0.15); // وميض الإصابة[cite: 1]
  //         this.explodeAndRemove(enemy); // الانفجار والحذف[cite: 1]
  //         break; 
  //       }
  //     }
  //   }
  // }
  // ✅ الدالة الجديدة كاملة
private checkPlayerShotsHitEnemies(): void {
  const projs = (this.projectileManager as any).projectiles as Array<{
    kind:  string;
    mesh:  THREE.Object3D;
    alive: boolean;
  }> | undefined;
  if (!projs) return;

  const enemies = this.enemyManager.getEnemies();

  for (const proj of projs) {
    if (!proj.alive) continue;

    const hitRadiusSq = proj.kind === 'missile'
      ? this.ENEMY_HIT_RADIUS_SQ_MISSILE
      : this.ENEMY_HIT_RADIUS_SQ_BULLET;

    for (const enemy of enemies) {
      if (enemy.userData.isDead) continue;

      // ✅ distanceToSquared بدل distanceTo — بيتجنب sqrt تماماً
      // ✅ مش بنعمل new Vector3 — بنستخدم _diffVec اللي اتعمل مرة واحدة
      const distSq = this._diffVec
        .subVectors(proj.mesh.position, enemy.position)
        .lengthSq();

      if (distSq < hitRadiusSq) {
        proj.alive            = false;
        enemy.userData.isDead = true;

        this.flashEnemy(enemy, 0.15);
        this.explodeAndRemove(enemy);
        break;  // الرصاصة ماتت — مفيش داعي نكمل على باقي الأعداء
      }
    }
  }
}

  // ── Enemy death ───────────────────────────────────────────────

  private explodeAndRemove(enemy: THREE.Object3D): void {
    this.spawnExplosion(enemy.position.clone());

    const toRemove = this.shots.filter(s => s.owner === enemy);
    for (const s of toRemove) this.scene.remove(s.mesh);
    this.shots = this.shots.filter(s => s.owner !== enemy);
    this.cooldowns.delete(enemy.uuid);
    this.shootIntervals.delete(enemy.uuid);

    this.startDeathFall(enemy);

    this.notifications.show({
      type: 'kill', title: 'BANDIT DOWN',
      msg: 'Target eliminated', duration: 3500,
    });

    if ((window as any).missionController) {
      (window as any).missionController.onEnemyKilled();
  }
}

// private startDeathFall(enemy: THREE.Object3D): void {
//   // امنع EnemyManager من تحريكه
//   enemy.userData.isDead = true;

//   const FALL_DURATION = 2.0;   // ثواني الوقوع
//   const FALL_SPEED    = 8_000; // سرعة الهبوط
//   const SPIN_SPEED    = 2.5;   // سرعة الدوران

//   let elapsed = 0;

//   const tick = (delta: number) => {
//     elapsed += delta;
//     const t = elapsed / FALL_DURATION;

//     enemy.position.y    -= FALL_SPEED * delta;
//     enemy.rotation.z    += SPIN_SPEED * delta;
//     enemy.rotation.x    += SPIN_SPEED * 0.5 * delta;

//     // يصغر شوية وهو بيوقع
//     const scale = enemy.scale.x * (1 - 0.3 * delta);
//     enemy.scale.setScalar(Math.max(scale, 0));

//     if (t >= 1) {
//       this.enemyManager.removeEnemy(enemy);
//     } else {
//       // استدعاء نفسه في الفريم الجاي
//       requestAnimationFrame(() => tick(1/60));
//     }
//   };

//   requestAnimationFrame(() => tick(1/60));
// }

// ✅ الدالة الجديدة — بدل startDeathFall
private startDeathFall(enemy: THREE.Object3D): void {
  enemy.userData.isDead = true;   // يوقف EnemyManager من تحريكه

  this.fallingEnemies.push({
    obj:       enemy,
    elapsed:   0,
    duration:  2.0,
    fallSpeed: 8_000,
    spinSpeed: 2.5,
  });
}

    // const FALL_DURATION = 2.0;
    // const FALL_SPEED    = 8_000;
    // const SPIN_SPEED    = 2.5;

  //     let life = 0;
  //     const id = setInterval(() => {
  //       life += 0.016;
  //       const t = life / 0.7;
  //       if (t >= 1) {
  //         this.scene.remove(sprite);
  //         mat.dispose();
  //         clearInterval(id);
  //       } else {
  //         mat.opacity = 0.9 * (1 - t * t);
  //         sprite.scale.setScalar(s * (1 + t * 2.5));
  //       }
  //     }, 16);
  //   }
  // }
//   private spawnExplosion(pos: THREE.Vector3): void {
//   // حلقة واحدة بس — 6 sprites خفيفة
//   const layers = [
//     { color: 0xffffff, size: 400,  opacity: 1.0, speed: 0.5  }, // لمعة بيضاء لحظية
//     { color: 0xffdd00, size: 700,  opacity: 0.9, speed: 0.7  }, // كرة صفراء
//     { color: 0xff6600, size: 900,  opacity: 0.8, speed: 0.9  }, // برتقالي
//     { color: 0xff2200, size: 600,  opacity: 0.7, speed: 1.1  }, // أحمر
//     { color: 0x331100, size: 1100, opacity: 0.5, speed: 0.6  }, // دخان داكن
//     { color: 0x888888, size: 800,  opacity: 0.3, speed: 0.4  }, // دخان رمادي
//   ];

//   for (const layer of layers) {
//     const mat = new THREE.SpriteMaterial({
//       color:       layer.color,
//       transparent: true,
//       opacity:     layer.opacity,
//       blending:    layer.color === 0x331100 || layer.color === 0x888888
//                      ? THREE.NormalBlending
//                      : THREE.AdditiveBlending,
//       depthWrite:  false,
//     });

//     const sprite = new THREE.Sprite(mat);
//     sprite.position.copy(pos);
//     sprite.scale.setScalar(layer.size * 0.3); // يبدأ صغير
//     this.scene.add(sprite);

//     const targetSize = layer.size;
//     const duration   = 0.55 + layer.speed * 0.2;
//     let   elapsed    = 0;

//     const tick = () => {
//       elapsed += 0.016;
//       const t = elapsed / duration; // 0 → 1

//       if (t >= 1) {
//         this.scene.remove(sprite);
//         mat.dispose();
//         return;
//       }

//       // يكبر بسرعة في الأول ثم يبطأ
//       const eased = 1 - Math.pow(1 - t, 2);
//       sprite.scale.setScalar(targetSize * eased);

//       // يعتم بالتدريج
//       mat.opacity = layer.opacity * (1 - t * t);

//       requestAnimationFrame(tick);
//     };

//     requestAnimationFrame(tick);
//   }
// }
// ✅ الدالة الجديدة — بدل spawnExplosion
private spawnExplosion(pos: THREE.Vector3): void {
  const layers = [
    { color: 0xffffff, size: 400,  opacity: 1.0, duration: 0.25 },
    { color: 0xffdd00, size: 700,  opacity: 0.9, duration: 0.45 },
    { color: 0xff6600, size: 900,  opacity: 0.8, duration: 0.55 },
    { color: 0xff2200, size: 600,  opacity: 0.7, duration: 0.50 },
    { color: 0x331100, size: 1100, opacity: 0.5, duration: 0.65 },
    { color: 0x888888, size: 800,  opacity: 0.3, duration: 0.60 },
  ];

  for (const layer of layers) {
    const mat = new THREE.SpriteMaterial({
      color:       layer.color,
      transparent: true,
      opacity:     layer.opacity,
      blending:    (layer.color === 0x331100 || layer.color === 0x888888)
                     ? THREE.NormalBlending
                     : THREE.AdditiveBlending,
      depthWrite:  false,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.setScalar(layer.size * 0.3);
    this.scene.add(sprite);

    this.explosionParticles.push({
      sprite,
      mat,
      elapsed:   0,
      duration:  layer.duration,
      startSize: layer.size,
      opacity:   layer.opacity,
    });
  }
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