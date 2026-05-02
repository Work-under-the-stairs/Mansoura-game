import * as THREE from 'three';
import { Cockpit } from './Cockpit';
import { EnemyManager } from './EnemyManager';
import { ProjectileManager } from './ProjectileManager';
import { NotificationSystem } from './NotificationSystem';

// ═══════════════════════════════════════════════════════════════
//  HOW TO USE — Engine.ts
//
//  1. import { CombatSystem } from './CombatSystem';
//  2. private combatSystem: CombatSystem;
//  3. this.combatSystem = new CombatSystem(
//       this.scene, this.camera, this.cockpit,
//       this.enemies, this.projectileManager,
//       this.notifications,
//       () => this.resetForReplay(),
//       () => this.exitToMenu(),
//     );
//  4. In animate():   this.combatSystem.update(delta);
//  5. In destroy():   this.combatSystem.dispose();
//  6. On replay:      this.combatSystem.reset();
// ═══════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────
//  Interfaces
// ───────────────────────────────────────────────────────────────

interface FallingEnemy {
  obj:       THREE.Object3D;
  elapsed:   number;
  duration:  number;
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

interface EnemyShot {
  mesh:      THREE.Object3D;
  velocity:  THREE.Vector3;
  life:      number;
  isMissile: boolean;
  owner:     THREE.Object3D;
}

// ✅ FIX ② — Object Pool interfaces
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
//  HealthSystem
// ───────────────────────────────────────────────────────────────
class HealthSystem {
  public hp      = 100;
  public maxHp   = 100;
  public isDead  = false;

  public  shakeTimer      = 0;
  public  shakeIntensity  = 0;
  private readonly SHAKE_DURATION = 0.40;

  private cameraBasePos    = new THREE.Vector3();
  private cameraBasePosSet = false;

  private hudFill:    HTMLElement;
  private hudLabel:   HTMLElement;
  private hitOverlay: HTMLElement;
  private deathEl:    HTMLElement;

  // ✅ TEAMMATE — callbacks كـ public properties عشان Engine يقدر يغيرهم
  public onRestartCallback?: () => void;
  public onExitCallback?:    () => void;

  constructor(
    private cockpit: Cockpit,
    private onDeathCallback?:  () => void,
    onRestartCallback?: () => void,
    onExitCallback?:    () => void,
  ) {
    this.onRestartCallback = onRestartCallback;
    this.onExitCallback    = onExitCallback;
    this.buildHUD();
    this.hudFill    = document.getElementById('cs-hp-fill')!;
    this.hudLabel   = document.getElementById('cs-hp-label')!;
    this.hitOverlay = document.getElementById('cs-hit-overlay')!;
    this.deathEl    = document.getElementById('cs-death')!;
  }

  // ── Public ──────────────────────────────────────────────────

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

    const cam = model.children.find(
      c => c instanceof THREE.PerspectiveCamera,
    ) as THREE.PerspectiveCamera | undefined;

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

  // ✅ TEAMMATE — reset كامل للـ HP عند الـ replay
  public reset(): void {
    this.hp               = this.maxHp;
    this.isDead           = false;
    this.shakeTimer       = 0;
    this.shakeIntensity   = 0;
    this.cameraBasePosSet = false;

    // أعد الكاميرا لمكانها الأصلي
    const model = this.cockpit.model;
    if (model && this.cameraBasePos.lengthSq() > 0) {
      const cam = model.children.find(
        c => c instanceof THREE.PerspectiveCamera,
      ) as THREE.PerspectiveCamera | undefined;
      if (cam) cam.position.copy(this.cameraBasePos);
    }

    this.refreshBar();
    this.deathEl.classList.remove('cs-visible');
  }

  public dispose(): void {
    document.getElementById('cs-hud-root')?.remove();
  }

  // ── Private ─────────────────────────────────────────────────

  private refreshBar(): void {
    const pct = this.hp / this.maxHp;
    this.hudFill.style.width = `${pct * 100}%`;
    if (pct > 0.5) {
      this.hudFill.style.background = 'linear-gradient(90deg,#00c97a,#00ffcc)';
      this.hudLabel.style.color     = '#00ffcc';
    } else if (pct > 0.25) {
      this.hudFill.style.background = 'linear-gradient(90deg,#c97a00,#ffcc00)';
      this.hudLabel.style.color     = '#ffcc00';
    } else {
      this.hudFill.style.background = 'linear-gradient(90deg,#c90000,#ff4444)';
      this.hudLabel.style.color     = '#ff4444';
    }
    this.hudLabel.textContent = `HULL  ${Math.round(pct * 100)}%`;
  }

  private flashScreen(): void {
    this.hitOverlay.style.opacity = '1';
    setTimeout(() => { this.hitOverlay.style.opacity = '0'; }, 100);
  }

  private onDeath(): void {
    this.isDead         = true;
    this.shakeTimer     = 3.0;
    this.shakeIntensity = 0.0006;
    this.deathEl.classList.add('cs-visible');
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
        #cs-hp-bar {
          width: 240px; height: 9px; background: rgba(0,0,0,0.5);
          border: 1px solid rgba(0,255,180,0.3); border-radius: 2px; overflow: hidden;
        }
        #cs-hp-fill {
          height: 100%; width: 100%;
          background: linear-gradient(90deg,#00c97a,#00ffcc);
          transition: width 0.12s ease;
        }
        #cs-hit-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.35) 100%);
          pointer-events: none; opacity: 0; transition: opacity 0.15s ease;
        }
        #cs-death {
          position: fixed; inset: 0; z-index: 10001;
          display: none; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
          pointer-events: all; opacity: 0; transition: opacity 0.8s ease;
        }
        #cs-death.cs-visible { display: flex; opacity: 1; }
        #cs-death-modal {
          display: flex; flex-direction: column; align-items: center; gap: 24px;
          padding: 48px 64px; background: rgba(8,10,18,0.95);
          border: 1px solid rgba(255,34,34,0.4); border-radius: 4px;
          box-shadow: 0 0 60px rgba(255,0,0,0.2);
        }
        #cs-death-title {
          font-family: 'Courier New', monospace; font-size: 42px;
          color: #ff2222; letter-spacing: 10px; margin: 0;
        }
        .cs-btn {
          font-family: 'Courier New', monospace; padding: 12px 36px;
          background: transparent; border: 1px solid; border-radius: 2px;
          cursor: pointer; width: 220px; letter-spacing: 2px; transition: all 0.2s;
        }
        #cs-btn-retry { color: #00ffcc; border-color: rgba(0,255,180,0.5); }
        #cs-btn-retry:hover {
          background: rgba(0,255,180,0.15);
          box-shadow: 0 0 15px rgba(0,255,180,0.3);
        }
        #cs-btn-exit { color: #aaa; border-color: #444; }
        #cs-btn-exit:hover { background: rgba(255,255,255,0.1); color: #fff; }
      </style>

      <div id="cs-hp-label">HULL 100%</div>
      <div id="cs-hp-bar"><div id="cs-hp-fill"></div></div>
      <div id="cs-hit-overlay"></div>

      <div id="cs-death">
        <div id="cs-death-modal">
          <div id="cs-death-title">DESTROYED</div>
          <div style="color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:3px;">
            MISSION FAILED
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <button class="cs-btn" id="cs-btn-retry">↺ RETRY MISSION</button>
            <button class="cs-btn" id="cs-btn-exit">⎋ EXIT TO MENU</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // ✅ TEAMMATE — بيقرأ الـ callback من الـ instance مش من الـ closure
    // عشان لو Engine عدّلهم بعدين يشتغلوا صح
    document.getElementById('cs-btn-retry')?.addEventListener('click', () => {
      this.onRestartCallback?.();
    });
    document.getElementById('cs-btn-exit')?.addEventListener('click', () => {
      this.onExitCallback?.();
    });
  }
}


// ───────────────────────────────────────────────────────────────
//  CombatSystem
// ───────────────────────────────────────────────────────────────
export class CombatSystem {

  public readonly health: HealthSystem;

  // ── Combat config ────────────────────────────────────────────
  private readonly ENGAGE_DIST         = 120_000;
  private readonly BULLET_SPEED        = 12_000;
  private readonly MISSILE_SPEED       =  5_000;
  private readonly BULLET_LIFE         = 10.0;
  private readonly MISSILE_LIFE        = 12.0;
  private readonly BULLET_DAMAGE       = 3;
  private readonly MISSILE_DAMAGE      = 10;
  private readonly HIT_R_BULLET_SQ     = 500 * 500;  // ✅ FIX ③ — مربعات بدل sqrt
  private readonly HIT_R_MISSILE_SQ    = 500 * 500;
  private readonly SHOOT_INTERVAL_MIN  = 2.0;
  private readonly SHOOT_INTERVAL_MAX  = 5.0;

  // ── Enemy HP config ──────────────────────────────────────────
  //  ✅ غيّري ENEMY_MAX_HP لأي قيمة تحبيها:
  //     1   = تموت بضربة واحدة (الوضع الحالي)
  //     3   = تتحمل 3 رصاصات
  //     100 = نظام HP كامل
  private readonly ENEMY_MAX_HP        = 1;
  private readonly PLAYER_BULLET_DMG   = 12;
  private readonly PLAYER_MISSILE_DMG  = 40;

  // ✅ FIX ③ — مربعات نصف قطر الـ hitbox بدل sqrt كل frame
  private readonly ENEMY_HIT_RADIUS_SQ_BULLET  = 3000 * 3000;
  private readonly ENEMY_HIT_RADIUS_SQ_MISSILE = 3000 * 3000;

  // ── Shared geometry / material ───────────────────────────────
  private readonly bulletGeo:   THREE.CylinderGeometry;
  private readonly bulletMat:   THREE.MeshBasicMaterial;
  private readonly missileBody: THREE.CylinderGeometry;
  private readonly missileMat:  THREE.MeshBasicMaterial;
  private readonly missileGlow: THREE.SpriteMaterial;

  // ── Runtime state ────────────────────────────────────────────
  private shots:         EnemyShot[]         = [];
  private cooldowns      = new Map<string, number>();
  private shootIntervals = new Map<string, number>();

  // ✅ FIX ① — قوائم بدل rAF منفصل
  private fallingEnemies:     FallingEnemy[]      = [];
  private explosionParticles: ExplosionParticle[] = [];

  // ✅ FIX ② — Object Pools
  private bulletPool:  PooledBullet[]  = [];
  private missilePool: PooledMissile[] = [];
  private readonly BULLET_POOL_SIZE  = 40;
  private readonly MISSILE_POOL_SIZE = 10;

  // ✅ FIX ④ — Reusable vectors — بتتعمل مرة واحدة فقط
  private readonly _cockpitPos = new THREE.Vector3();
  private readonly _origin     = new THREE.Vector3();
  private readonly _playerFwd  = new THREE.Vector3();
  private readonly _aimPos     = new THREE.Vector3();
  private readonly _shotDir    = new THREE.Vector3();
  private readonly _diffVec    = new THREE.Vector3();
  private readonly _forward    = new THREE.Vector3(0, 0, -1);

  // ✅ FIX ⑤ — Flash enemy: cache للمواد + timers بدل rAF
  private readonly _flashMaterialCache = new Map<
    string,
    { mat: THREE.MeshStandardMaterial; baseEmissive: THREE.Color }[]
  >();
  private readonly _flashTimers = new Map<
    string,
    { timer: number; duration: number }
  >();

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

    this.bulletGeo = new THREE.CylinderGeometry(2.5, 2.5, 28, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });

    this.missileBody = new THREE.CylinderGeometry(5, 5, 70, 8);
    this.missileBody.rotateX(Math.PI / 2);
    this.missileMat  = new THREE.MeshBasicMaterial({ color: 0xff2200 });

    this.missileGlow = new THREE.SpriteMaterial({
      color: 0xff4400, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    // ✅ FIX ② — ابني الـ pools مرة واحدة عند البداية
    this.initPools();
  }

  // ── Public API ───────────────────────────────────────────────

  public showHUD(): void {
    const root = document.getElementById('cs-hud-root');
    if (root) root.style.visibility = 'visible';
  }

  public hideHUD(): void {
    const root = document.getElementById('cs-hud-root');
    if (root) root.style.visibility = 'hidden';
  }

  // ✅ TEAMMATE — reset كامل للـ combat عند الـ replay
  public reset(): void {
    // 1. أخفي كل الطلقات الطايرة وارجّعها للـ pool
    for (const s of this.shots) this.releaseShot(s.mesh);
    this.shots = [];

    // 2. امسح timers الأعداء عشان ما يطلقوش على طول لما يرجعوا
    this.cooldowns.clear();
    this.shootIntervals.clear();

    // 3. امسح الـ falling enemies والانفجارات اللي لسه شغالة
    for (const p of this.explosionParticles) {
      this.scene.remove(p.sprite);
      p.mat.dispose();
    }
    this.explosionParticles = [];
    this.fallingEnemies     = [];

    // 4. امسح flash cache عشان الأعداء الجدد يبدأوا نضيفين
    this._flashMaterialCache.clear();
    this._flashTimers.clear();

    // 5. reset الـ HP وأخفي شاشة الموت
    this.health.reset();
    this.showHUD();
  }

  // ✅ FIX ④ — مفيش new Vector3 هنا خالص
  public update(delta: number): void {
    this.health.update(delta);
    if (this.health.isDead) return;

    this.camera.getWorldPosition(this._cockpitPos);

    this.updateEnemyShooting(delta, this._cockpitPos);
    this.updateEnemyShots(delta, this._cockpitPos);
    this.checkPlayerShotsHitEnemies();

    // ✅ FIX ① — بدل rAF منفصل
    this.updateFallingEnemies(delta);
    this.updateExplosions(delta);

    // ✅ FIX ⑤ — flash update في الـ main loop
    this.updateFlashTimers(delta);
  }

  public dispose(): void {
    for (const s of this.shots) this.releaseShot(s.mesh);
    this.shots = [];

    this.bulletGeo.dispose();
    this.bulletMat.dispose();
    this.missileBody.dispose();
    this.missileMat.dispose();
    this.missileGlow.dispose();

    // ✅ FIX ② — dispose pools
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

    // ✅ FIX ① — dispose explosions
    for (const p of this.explosionParticles) {
      this.scene.remove(p.sprite);
      p.mat.dispose();
    }
    this.explosionParticles = [];
    this.fallingEnemies     = [];

    this.health.dispose();
  }


  // ═══════════════════════════════════════════════════════════
  //  FIX ② — Object Pool
  // ═══════════════════════════════════════════════════════════

  private initPools(): void {
    const tailGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 14),
      new THREE.Vector3(0, 0, 55),
    ]);

    for (let i = 0; i < this.BULLET_POOL_SIZE; i++) {
      const group   = new THREE.Group();
      const core    = new THREE.Mesh(this.bulletGeo, this.bulletMat);
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

      group.visible = false;
      this.scene.add(group);
      this.bulletPool.push({ group, glow, glowMat, tail, tailMat, inUse: false });
    }

    for (let i = 0; i < this.MISSILE_POOL_SIZE; i++) {
      const group   = new THREE.Group();
      const body    = new THREE.Mesh(this.missileBody, this.missileMat);
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
      this.scene.add(group);
      this.missilePool.push({ group, glow, glowMat, exhaust, exhaustMat, inUse: false });
    }
  }

  private acquireBullet(): PooledBullet | null {
    for (const b of this.bulletPool) {
      if (!b.inUse) {
        b.inUse           = true;
        b.group.visible   = true;
        b.glowMat.opacity = 0.70;
        return b;
      }
    }
    return null;
  }

  private acquireMissile(): PooledMissile | null {
    for (const m of this.missilePool) {
      if (!m.inUse) {
        m.inUse              = true;
        m.group.visible      = true;
        m.glowMat.opacity    = 0.55;
        m.exhaustMat.opacity = 0.40;
        return m;
      }
    }
    return null;
  }

  private releaseShot(mesh: THREE.Object3D): void {
    mesh.visible = false;
    const b = this.bulletPool.find(x => x.group === mesh);
    if (b) { b.inUse = false; return; }
    const m = this.missilePool.find(x => x.group === mesh);
    if (m)  { m.inUse = false; }
  }


  // ═══════════════════════════════════════════════════════════
  //  Enemy shooting AI
  // ═══════════════════════════════════════════════════════════

  private updateEnemyShooting(delta: number, cockpitPos: THREE.Vector3): void {
    for (const enemy of this.enemyManager.getEnemies()) {
      if (enemy.userData.isDead) continue;

      // ✅ FIX ③ — distanceToSquared بدل distanceTo
      const distSq = this._diffVec
        .subVectors(enemy.position, cockpitPos)
        .lengthSq();
      if (distSq > this.ENGAGE_DIST * this.ENGAGE_DIST) continue;

      const dist = Math.sqrt(distSq); // sqrt مرة واحدة بس عند الحاجة

      if (!this.cooldowns.has(enemy.uuid)) {
        const interval = this.randomInterval();
        this.cooldowns.set(enemy.uuid, interval * Math.random());
        this.shootIntervals.set(enemy.uuid, interval);
      }

      const cd = (this.cooldowns.get(enemy.uuid) ?? 0) - delta;
      this.cooldowns.set(enemy.uuid, cd);

      if (cd <= 0) {
        this.fireEnemyShot(enemy, cockpitPos, dist);
        this.cooldowns.set(enemy.uuid, this.randomInterval());
      }
    }
  }

  // ✅ FIX ④ — صفر new Vector3
  private fireEnemyShot(
    enemy:     THREE.Object3D,
    targetPos: THREE.Vector3,
    dist:      number,
  ): void {
    this._origin.copy(enemy.position);

    const travelTime = dist / this.BULLET_SPEED;
    const speed      = this.cockpit.currentSpeed ?? 255;

    this._playerFwd.set(0, 0, -1);
    if (this.cockpit.model) {
      this._playerFwd.applyQuaternion(this.cockpit.model.quaternion);
    }

    this._aimPos
      .copy(targetPos)
      .addScaledVector(this._playerFwd, speed * travelTime);
    this._aimPos.x += (Math.random() - 0.5) * dist * 0.02;

    this._shotDir.subVectors(this._aimPos, this._origin).normalize();
    this._shotDir.x += (Math.random() - 0.5) * 0.04;
    this._shotDir.y += (Math.random() - 0.5) * 0.04;
    this._shotDir.normalize();

    const isMissile = dist < 40_000 && Math.random() < 0.20;

    if (isMissile) {
      const pooled = this.acquireMissile();
      if (!pooled) return;
      pooled.group.position.copy(this._origin);
      pooled.group.quaternion.setFromUnitVectors(this._forward, this._shotDir);
      this.shots.push({
        mesh:      pooled.group,
        velocity:  this._shotDir.clone().multiplyScalar(this.MISSILE_SPEED),
        life:      this.MISSILE_LIFE,
        isMissile: true,
        owner:     enemy,
      });
    } else {
      const pooled = this.acquireBullet();
      if (!pooled) return;
      pooled.group.position.copy(this._origin);
      pooled.group.quaternion.setFromUnitVectors(this._forward, this._shotDir);
      this.shots.push({
        mesh:      pooled.group,
        velocity:  this._shotDir.clone().multiplyScalar(this.BULLET_SPEED),
        life:      this.BULLET_LIFE,
        isMissile: false,
        owner:     enemy,
      });
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  Update flying shots + hit player
  // ═══════════════════════════════════════════════════════════

  // ✅ FIX ③ + ④ — distanceSq + صفر new Vector3
  private updateEnemyShots(delta: number, cockpitPos: THREE.Vector3): void {
    const dead: EnemyShot[] = [];
    const t = Date.now() * 0.001;

    for (const s of this.shots) {
      s.life -= delta;
      if (s.life <= 0) { dead.push(s); continue; }

      s.mesh.position.addScaledVector(s.velocity, delta);

      this._shotDir.copy(s.velocity).normalize();
      s.mesh.quaternion.setFromUnitVectors(this._forward, this._shotDir);

      if (s.isMissile) {
        const fl      = 0.8 + 0.4 * Math.sin(t * 38);
        const exhaust = s.mesh.children[2] as THREE.Sprite | undefined;
        if (exhaust) {
          (exhaust.material as THREE.SpriteMaterial).opacity = 0.38 * fl;
          exhaust.scale.set(20 + fl * 4, 70 + fl * 30, 1);
        }
      }

      const distSq = this._diffVec
        .subVectors(s.mesh.position, cockpitPos)
        .lengthSq();
      const hitRSq = s.isMissile ? this.HIT_R_MISSILE_SQ : this.HIT_R_BULLET_SQ;

      if (distSq < hitRSq) {
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

    // ✅ FIX ② — رجّع للـ pool بدل scene.remove
    if (dead.length > 0) {
      for (const s of dead) this.releaseShot(s.mesh);
      const deadSet = new Set(dead);
      this.shots = this.shots.filter(s => !deadSet.has(s));
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  Player shots hitting enemies
  // ═══════════════════════════════════════════════════════════

  // ✅ FIX ③ — distanceSq + صفر Box3/setFromObject
  // ✅ NEW   — نظام HP احترافي مع ENEMY_MAX_HP
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

        // ✅ ابدأ الـ HP من ENEMY_MAX_HP لما العدو يتشاف أول مرة
        if (enemy.userData.hp === undefined) {
          enemy.userData.hp = this.ENEMY_MAX_HP;
        }

        const distSq = this._diffVec
          .subVectors(proj.mesh.position, enemy.position)
          .lengthSq();

        if (distSq < hitRadiusSq) {
          proj.alive = false;

          // ✅ نظام HP — طرح الدمج وتشيك الموت
          const dmg = proj.kind === 'missile'
            ? this.PLAYER_MISSILE_DMG
            : this.PLAYER_BULLET_DMG;

          enemy.userData.hp -= dmg;

          if (enemy.userData.hp > 0) {
            // لسه حي — وميض بس
            this.flashEnemy(enemy, 0.15);
          } else {
            // مات — وميض + انفجار
            enemy.userData.isDead = true;
            this.flashEnemy(enemy, 0.10);
            this.explodeAndRemove(enemy);
          }

          break; // الرصاصة خلصت — مش محتاج نكمل على باقي الأعداء
        }
      }
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  Enemy death
  // ═══════════════════════════════════════════════════════════

  private explodeAndRemove(enemy: THREE.Object3D): void {
    this.spawnExplosion(enemy.position.clone());

    // امسح طلقاته الطايرة وارجّعها للـ pool
    const toRemove = this.shots.filter(s => s.owner === enemy);
    for (const s of toRemove) this.releaseShot(s.mesh);
    this.shots = this.shots.filter(s => s.owner !== enemy);

    this.cooldowns.delete(enemy.uuid);
    this.shootIntervals.delete(enemy.uuid);

    // ✅ FIX ① — بدل rAF
    this.startDeathFall(enemy);

    this.notifications.show({
      type: 'kill', title: 'BANDIT DOWN',
      msg: 'Target eliminated', duration: 3500,
    });

    if ((window as any).missionController) {
      (window as any).missionController.onEnemyKilled();
    }
  }

  // ✅ FIX ① — بيضيف للـ list بدل rAF
  private startDeathFall(enemy: THREE.Object3D): void {
    enemy.userData.isDead = true;
    this.fallingEnemies.push({
      obj:       enemy,
      elapsed:   0,
      duration:  2.0,
      fallSpeed: 8_000,
      spinSpeed: 2.5,
    });
  }

  // ✅ FIX ① — بتتكال من update()
  private updateFallingEnemies(delta: number): void {
    if (this.fallingEnemies.length === 0) return;
    const done: FallingEnemy[] = [];

    for (const f of this.fallingEnemies) {
      f.elapsed += delta;

      f.obj.position.y -= f.fallSpeed * delta;
      f.obj.rotation.z += f.spinSpeed * delta;
      f.obj.rotation.x += f.spinSpeed * 0.5 * delta;

      const scale = Math.max(0, f.obj.scale.x * (1 - 0.3 * delta));
      f.obj.scale.setScalar(scale);

      if (f.elapsed >= f.duration) {
        this.enemyManager.removeEnemy(f.obj);
        done.push(f);
      }
    }

    if (done.length > 0) {
      const doneSet = new Set(done);
      this.fallingEnemies = this.fallingEnemies.filter(f => !doneSet.has(f));
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  Explosion
  // ═══════════════════════════════════════════════════════════

  // ✅ FIX ① — بيضيف particles للـ list بدل rAF
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
        sprite, mat,
        elapsed:   0,
        duration:  layer.duration,
        startSize: layer.size,
        opacity:   layer.opacity,
      });
    }
  }

  // ✅ FIX ① — بتتكال من update()
  private updateExplosions(delta: number): void {
    if (this.explosionParticles.length === 0) return;
    const done: ExplosionParticle[] = [];

    for (const p of this.explosionParticles) {
      p.elapsed += delta;
      const t = p.elapsed / p.duration;

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

    if (done.length > 0) {
      const doneSet = new Set(done);
      this.explosionParticles = this.explosionParticles.filter(p => !doneSet.has(p));
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  FIX ⑤ — Flash enemy بدون traverse كل frame
  // ═══════════════════════════════════════════════════════════

  // traverse مرة واحدة بس — أو من cache لو اتعمل قبل كده
  private getFlashMaterials(
    root: THREE.Object3D,
  ): { mat: THREE.MeshStandardMaterial; baseEmissive: THREE.Color }[] {
    const cached = this._flashMaterialCache.get(root.uuid);
    if (cached) return cached;

    const list: { mat: THREE.MeshStandardMaterial; baseEmissive: THREE.Color }[] = [];
    root.traverse(c => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m?.emissive) {
        list.push({ mat: m, baseEmissive: m.emissive.clone() });
      }
    });

    this._flashMaterialCache.set(root.uuid, list);
    return list;
  }

  private flashEnemy(root: THREE.Object3D, duration: number): void {
    this.getFlashMaterials(root); // populate cache لو مش موجود
    this._flashTimers.set(root.uuid, { timer: duration, duration });
  }

  // ✅ FIX ⑤ — بتتكال من update() مش من rAF
  private updateFlashTimers(delta: number): void {
    if (this._flashTimers.size === 0) return;

    for (const [uuid, flash] of this._flashTimers) {
      flash.timer -= delta;

      const targets = this._flashMaterialCache.get(uuid);
      if (!targets) continue;

      if (flash.timer <= 0) {
        for (const { mat, baseEmissive } of targets) {
          mat.emissive.copy(baseEmissive);
          mat.emissiveIntensity = 0;
        }
        this._flashTimers.delete(uuid);
        continue;
      }

      const intensity = flash.timer / flash.duration;
      for (const { mat } of targets) {
        mat.emissive.setRGB(intensity, intensity * 0.25, 0);
        mat.emissiveIntensity = intensity * 3;
      }
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════════════

  private randomInterval(): number {
    return this.SHOOT_INTERVAL_MIN +
      Math.random() * (this.SHOOT_INTERVAL_MAX - this.SHOOT_INTERVAL_MIN);
  }
}