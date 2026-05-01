import * as THREE from 'three';
import { Cockpit } from './Cockpit';
import { EnemyManager } from './EnemyManager';
import { ProjectileManager } from './ProjectileManager';
import { NotificationSystem } from './NotificationSystem';

// ═══════════════════════════════════════════════════════════════
//  HOW TO USE — add these three lines to Engine.ts:
//
//  1. Import:
//     import { CombatSystem } from './CombatSystem';
//
//  2. Declare property:
//     private combatSystem: CombatSystem;
//
//  3. After enemies is created in constructor:
//     this.combatSystem = new CombatSystem(
//       this.scene, this.camera, this.cockpit,
//       this.enemies, this.projectileManager,
//       this.notifications,
//     );
//
//  4. In animate():
//     this.combatSystem.update(delta);
//
//  5. In destroy():
//     this.combatSystem.dispose();
// ═══════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────
//  HealthSystem  (self-contained — owns HUD DOM)
// ───────────────────────────────────────────────────────────────
class HealthSystem {
  public hp      = 100;
  public maxHp   = 100;
  public isDead  = false;

  // Shake state — applied to cockpit model, NOT camera
  public  shakeTimer      = 0;
  public  shakeIntensity  = 0;
  private readonly SHAKE_DURATION = 0.40; // s

  // Camera base offset — restored after every shake frame
  private cameraBasePos = new THREE.Vector3();
  private cameraBasePosSet = false;

  private hudFill:    HTMLElement;
  private hudLabel:   HTMLElement;
  private hitOverlay: HTMLElement;
  private deathEl:    HTMLElement;

  constructor(
    private cockpit: Cockpit,
    private onDeathCallback?: () => void,
  ) {
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
    // Shake driven by cockpit model roll/pitch offset
    this.shakeTimer     = this.SHAKE_DURATION;
    this.shakeIntensity = amount * 0.00008; // tuned for cockpit scale
    if (this.hp <= 0) this.onDeath();
  }

  /**
   * Call every frame. Applies a small random rotation offset to the
   * cockpit MODEL (not camera) then snaps it back — gives a "jolt"
   * feel without permanently displacing the camera.
   */
  public update(delta: number): void {
    if (this.shakeTimer <= 0) return;

    const model = this.cockpit.model;
    if (!model) return;

    // Capture camera local rest position once
    const cam = model.children.find(c => c instanceof THREE.PerspectiveCamera) as THREE.PerspectiveCamera | undefined;
    if (cam && !this.cameraBasePosSet) {
      this.cameraBasePos.copy(cam.position);
      this.cameraBasePosSet = true;
    }

    this.shakeTimer -= delta;
    const t   = Math.max(0, this.shakeTimer / this.SHAKE_DURATION); // 1 → 0
    const mag = this.shakeIntensity * t * t; // eases out

    // Jolt the camera LOCAL position inside the cockpit group
    // — it snaps back to base every frame so position never drifts
    if (cam) {
      cam.position.set(
        this.cameraBasePos.x + (Math.random() - 0.5) * mag * 0.8,
        this.cameraBasePos.y + (Math.random() - 0.5) * mag * 0.8,
        this.cameraBasePos.z + (Math.random() - 0.5) * mag * 0.4,
      );
    }

    // Also add a tiny rotation wobble to the cockpit itself
    model.rotation.x += (Math.random() - 0.5) * mag * 0.18;
    model.rotation.z += (Math.random() - 0.5) * mag * 0.18;

    // When shake ends, restore camera to exact base position
    if (this.shakeTimer <= 0 && cam && this.cameraBasePosSet) {
      cam.position.copy(this.cameraBasePos);
    }
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
          font-family: 'Courier New', monospace;
          font-size: 11px; letter-spacing: 3px;
          color: #00ffcc;
          text-shadow: 0 0 8px #00ffcc88;
          text-transform: uppercase;
        }
        #cs-hp-bar {
          width: 240px; height: 9px;
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(0,255,180,0.3);
          border-radius: 2px; overflow: hidden;
        }
        #cs-hp-fill {
          height: 100%; width: 100%;
          background: linear-gradient(90deg,#00c97a,#00ffcc);
          border-radius: 2px;
          transition: width 0.12s ease, background 0.25s ease;
        }
        #cs-hit-overlay {
          position: fixed; inset: 0; z-index: 998;
          pointer-events: none; opacity: 0;
          background: radial-gradient(ellipse at center,
            transparent 25%, rgba(255,20,20,0.52) 100%);
          transition: opacity 0.07s ease;
        }
        #cs-death {
          position: fixed; inset: 0; z-index: 1000;
          pointer-events: none; opacity: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          transition: opacity 0.9s ease;
        }
        #cs-death.cs-visible { opacity: 1; background: rgba(0,0,0,0.68); }
        #cs-death-title {
          font-family: 'Courier New', monospace;
          font-size: 52px; letter-spacing: 14px;
          color: #ff2222;
          text-shadow: 0 0 40px #ff0000, 0 0 80px #ff000044;
        }
        #cs-death-sub {
          margin-top: 14px;
          font-family: 'Courier New', monospace;
          font-size: 12px; letter-spacing: 4px;
          color: rgba(255,255,255,0.45); text-transform: uppercase;
        }
      </style>
      <div id="cs-hp-label">HULL  100%</div>
      <div id="cs-hp-bar"><div id="cs-hp-fill"></div></div>
      <div id="cs-hit-overlay"></div>
      <div id="cs-death">
        <div id="cs-death-title">DESTROYED</div>
        <div id="cs-death-sub">hull integrity lost</div>
      </div>
    `;
    document.body.appendChild(root);
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
  /** the enemy that fired it — used to skip self-hit */
  owner:     THREE.Object3D;
}


// ───────────────────────────────────────────────────────────────
//  CombatSystem  — the one file your teammate doesn't need to touch
// ───────────────────────────────────────────────────────────────
export class CombatSystem {

  public readonly health: HealthSystem;

  // ── Enemy shooting config ─────────────────────────────────────
  private readonly ENGAGE_DIST      = 120_000;
  private readonly BULLET_SPEED     = 12_000;
  private readonly MISSILE_SPEED    =  5_000;
  private readonly BULLET_LIFE      = 10.0;
  private readonly MISSILE_LIFE     = 12.0;
  private readonly BULLET_DAMAGE    = 6;
  private readonly MISSILE_DAMAGE   = 22;
  private readonly HIT_R_BULLET     = 600;
  private readonly HIT_R_MISSILE    = 1_200;
  private readonly SHOOT_INTERVAL_MIN = 2.0;  // s
  private readonly SHOOT_INTERVAL_MAX = 5.0;

  // ── Player hit config ─────────────────────────────────────────
  private readonly PLAYER_BULLET_DMG   = 12;
  private readonly PLAYER_MISSILE_DMG  = 40;
  private readonly ENEMY_HIT_R_BULLET  = 200;
  private readonly ENEMY_HIT_R_MISSILE = 550;

  // ── Shared geometry / material for enemy projectiles ──────────
  private readonly bulletGeo:   THREE.CylinderGeometry;
  private readonly bulletMat:   THREE.MeshBasicMaterial;
  private readonly missileBody: THREE.CylinderGeometry;
  private readonly missileMat:  THREE.MeshBasicMaterial;
  private readonly missileGlow: THREE.SpriteMaterial;

  // Runtime state
  private shots:        EnemyShot[]  = [];
  /** Per-enemy shoot cooldown — keyed by object uuid */
  private cooldowns     = new Map<string, number>();
  private shootIntervals= new Map<string, number>();

  constructor(
    private scene:             THREE.Scene,
    private camera:            THREE.PerspectiveCamera,
    private cockpit:           Cockpit,
    private enemyManager:      EnemyManager,
    private projectileManager: ProjectileManager,
    private notifications:     NotificationSystem,
  ) {
    this.health = new HealthSystem(cockpit, () => {
      this.notifications.show({
        type:     'warn',
        title:    'SHIP DESTROYED',
        msg:      'Hull integrity lost — mission failed',
        duration: 8000,
      });
    });

    // Enemy bullet: glowing orange capsule
    this.bulletGeo = new THREE.CylinderGeometry(2.5, 2.5, 28, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });

    // Enemy missile: larger red cylinder + glow sprite
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

  public update(delta: number): void {
    this.health.update(delta);
    if (this.health.isDead) return;

    const cockpitPos = new THREE.Vector3();
    this.camera.getWorldPosition(cockpitPos);

    this.updateEnemyShooting(delta, cockpitPos);
    this.updateEnemyShots(delta, cockpitPos);
    this.checkPlayerShotsHitEnemies();
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
  }

  // ── Enemy shooting AI ─────────────────────────────────────────

  private updateEnemyShooting(delta: number, cockpitPos: THREE.Vector3): void {
    for (const enemy of this.enemyManager.getEnemies()) {
      const dist = enemy.position.distanceTo(cockpitPos);
      if (dist > this.ENGAGE_DIST) continue;

      // Initialise per-enemy cooldown on first sight
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

  private fireEnemyShot(
    enemy:      THREE.Object3D,
    targetPos:  THREE.Vector3,
    dist:       number,
  ): void {
    const origin = enemy.position.clone();

    // Predictive lead: where will the player be when bullet arrives?
    const travelTime = dist / this.BULLET_SPEED;
    const playerFwd  = this.cockpit.model
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.cockpit.model.quaternion)
      : new THREE.Vector3();
    const speed      = this.cockpit.currentSpeed ?? 255;
    const aimPos     = targetPos.clone().addScaledVector(playerFwd, speed * travelTime * 0.55);

    const spread = 0.04;
    const dir    = aimPos.sub(origin).normalize();
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.normalize();

    const isMissile = dist < 40_000 && Math.random() < 0.20;

    // Build visible mesh
    const mesh = isMissile
      ? this.buildMissileMesh(dir)
      : this.buildBulletMesh(dir);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    this.shots.push({
      mesh,
      velocity: dir.clone().multiplyScalar(isMissile ? this.MISSILE_SPEED : this.BULLET_SPEED),
      life:     isMissile ? this.MISSILE_LIFE : this.BULLET_LIFE,
      isMissile,
      owner:    enemy,
    });

    // console.log(`🔫 Enemy fired ${isMissile ? 'MISSILE' : 'bullet'} | dist: ${Math.round(dist)}`);
  }

  // ── Enemy shot visuals ────────────────────────────────────────

  private buildBulletMesh(dir: THREE.Vector3): THREE.Object3D {
    const group = new THREE.Group();

    // Core capsule
    const core = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    group.add(core);

    // Additive glow sprite so it's visible from far away
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color:      0xff7722,
      transparent: true,
      opacity:    0.70,
      blending:   THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.set(18, 18, 1);
    group.add(glow);

    // Tracer tail — thin line behind bullet
    const tailGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 14),
      new THREE.Vector3(0, 0, 55),
    ]);
    const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({
      color:      0xff8844,
      transparent: true,
      opacity:    0.65,
      blending:   THREE.AdditiveBlending,
      depthWrite: false,
    }));
    group.add(tail);

    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    return group;
  }

  private buildMissileMesh(dir: THREE.Vector3): THREE.Object3D {
    const group = new THREE.Group();

    const body = new THREE.Mesh(this.missileBody, this.missileMat);
    group.add(body);

    // Larger glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color:      0xff4400,
      transparent: true,
      opacity:    0.55,
      blending:   THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.set(50, 50, 1);
    group.add(glow);

    // Exhaust flare behind
    const exhaust = new THREE.Sprite(new THREE.SpriteMaterial({
      color:      0xffaa00,
      transparent: true,
      opacity:    0.40,
      blending:   THREE.AdditiveBlending,
      depthWrite: false,
    }));
    exhaust.scale.set(22, 80, 1);
    exhaust.position.set(0, 0, 45);
    group.add(exhaust);

    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    return group;
  }

  // ── Update flying shots + hit player ─────────────────────────

  private updateEnemyShots(delta: number, cockpitPos: THREE.Vector3): void {
    const dead: EnemyShot[] = [];
    const t = Date.now() * 0.001;

    for (const s of this.shots) {
      s.life -= delta;
      if (s.life <= 0) { dead.push(s); continue; }

      s.mesh.position.addScaledVector(s.velocity, delta);

      // Keep orientation along velocity direction
      const dir = s.velocity.clone().normalize();
      s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);

      // Flicker exhaust for missiles
      if (s.isMissile) {
        const fl = 0.8 + 0.4 * Math.sin(t * 38);
        const exhaust = s.mesh.children[2] as THREE.Sprite | undefined;
        if (exhaust) {
          (exhaust.material as THREE.SpriteMaterial).opacity = 0.38 * fl;
          exhaust.scale.set(20 + fl * 4, 70 + fl * 30, 1);
        }
      }

      // Hit test vs player
      const dist = s.mesh.position.distanceTo(cockpitPos);
      const hitR = s.isMissile ? this.HIT_R_MISSILE : this.HIT_R_BULLET;
      if (dist < hitR) {
        const dmg = s.isMissile ? this.MISSILE_DAMAGE : this.BULLET_DAMAGE;
        this.health.takeDamage(dmg);
        dead.push(s);

        // console.log(`🎯 PLAYER HIT -${dmg} HP → ${this.health.hp}`);

        this.notifications.show({
          type:     s.isMissile ? 'warn' : 'info',
          title:    s.isMissile ? 'MISSILE IMPACT' : 'HULL BREACH',
          msg:      `−${dmg} integrity  ·  ${Math.round(this.health.hp)}% remaining`,
          duration: 3000,
        });
      }
    }

    for (const s of dead) {
      this.scene.remove(s.mesh);
      this.shots = this.shots.filter(x => x !== s);
    }
  }

  // ── Player shots hitting enemies ──────────────────────────────

  private checkPlayerShotsHitEnemies(): void {
    // Access internal list via any — or add getProjectiles() to ProjectileManager
    const projs = (this.projectileManager as any).projectiles as Array<{
      kind:  string;
      mesh:  THREE.Object3D;
      alive: boolean;
    }> | undefined;
    if (!projs) return;

    for (const enemy of this.enemyManager.getEnemies()) {
      // Init HP on userData if not set
      if (enemy.userData.hp === undefined) {
        enemy.userData.hp = 100;
      }

      for (const proj of projs) {
        if (!proj.alive) continue;

        const dist = proj.mesh.position.distanceTo(enemy.position);
        const hitR = proj.kind === 'missile' ? this.ENEMY_HIT_R_MISSILE : this.ENEMY_HIT_R_BULLET;

        if (dist < hitR) {
          proj.alive = false;
          const dmg  = proj.kind === 'missile' ? this.PLAYER_MISSILE_DMG : this.PLAYER_BULLET_DMG;
          enemy.userData.hp -= dmg;

          // Hit flash
          this.flashEnemy(enemy, 0.15);

          // console.log(`💥 Enemy hit -${dmg} HP → ${enemy.userData.hp}`);

          if (enemy.userData.hp <= 0) {
            this.explodeAndRemove(enemy);
          }
        }
      }
    }
  }

  // ── Enemy death ───────────────────────────────────────────────

  private explodeAndRemove(enemy: THREE.Object3D): void {
    this.spawnExplosion(enemy.position.clone());
    // Remove any shots this enemy fired
    const toRemove = this.shots.filter(s => s.owner === enemy);
    for (const s of toRemove) {
      this.scene.remove(s.mesh);
    }
    this.shots = this.shots.filter(s => s.owner !== enemy);
    this.cooldowns.delete(enemy.uuid);
    this.shootIntervals.delete(enemy.uuid);
    this.enemyManager.removeEnemy(enemy);

    // console.log('💀 Enemy destroyed');

    this.notifications.show({
      type:     'kill',
      title:    'BANDIT DOWN',
      msg:      'Target eliminated',
      duration: 3500,
    });
  }

  private spawnExplosion(pos: THREE.Vector3): void {
    const colors = [0xff6600, 0xff3300, 0xffcc00, 0xffffff];
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        color:      colors[i % colors.length],
        transparent: true, opacity: 0.9,
        blending:   THREE.AdditiveBlending, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos).addScaledVector(
        new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize(),
        Math.random() * 500,
      );
      const s = 300 + Math.random() * 700;
      sprite.scale.set(s, s, 1);
      this.scene.add(sprite);

      let life = 0;
      const id = setInterval(() => {
        life += 0.016;
        const t = life / 0.7;
        if (t >= 1) {
          this.scene.remove(sprite);
          mat.dispose();
          clearInterval(id);
        } else {
          mat.opacity = 0.9 * (1 - t * t);
          sprite.scale.setScalar(s * (1 + t * 2.5));
        }
      }, 16);
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