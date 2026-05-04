import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Cockpit } from './Cockpit';

// ─── Tuning constants ────────────────────────────────────────────────────────

const SPAWN_DISTANCE   = 40_000;
const COMBAT_DISTANCE  = 10_000;
const SPAWN_SPREAD_X   = 10_000;
const BASE_SCALE       = 160;
const MIN_SCALE_FACTOR = 0.5;
const MAX_SCALE_FACTOR = 2.5;
const LAG_DURATION     = 3;

// ────────────────────────────────────────────────────────────────────────────

export class EnemyManager {
  private scene:   THREE.Scene;
  private cockpit: Cockpit;

  private enemies:    THREE.Object3D[] = [];
  private model:      THREE.Object3D | null = null;
  private modelReady  = false;

  private readonly _targetQuat = new THREE.Quaternion();

  private spawnQueue:      number[] = [];
  private elapsedTime      = 0;
  private positionCaptured = false;
  private spawnIndex       = 0;

  // ✅ Stable scale factor — محسوبة مرة واحدة مش كل frame
  private readonly _stableScale: number;

  private readonly _cockpitPos  = new THREE.Vector3();
  private readonly _forward     = new THREE.Vector3();
  private readonly _right       = new THREE.Vector3();
  private readonly _up          = new THREE.Vector3();
  private readonly _spawnOrigin = new THREE.Vector3();
  private readonly _targetPos   = new THREE.Vector3();

  constructor(
    scene:   THREE.Scene,
    _camera: THREE.PerspectiveCamera,
    cockpit: Cockpit,
  ) {
    this.scene   = scene;
    this.cockpit = cockpit;

    // ✅ احسب الـ scale مرة واحدة — القيمة مش بتتغير
    const distRatio   = THREE.MathUtils.clamp(COMBAT_DISTANCE / SPAWN_DISTANCE, 0, 1);
    const scaleFactor = THREE.MathUtils.lerp(MAX_SCALE_FACTOR, MIN_SCALE_FACTOR, distRatio);
    this._stableScale = BASE_SCALE * scaleFactor;

    this.loadModel();
  }

  private loadModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/models/enemy2.glb',
      (gltf) => {
        this.model = gltf.scene;
        this.model.scale.setScalar(BASE_SCALE);
        this.modelReady = true;
        // console.log('✅ Enemy model loaded');
      },
      undefined,
      (err) => console.error('❌ Enemy load error:', err),
    );
  }

  private tryInitSpawnPos(): boolean {
    if (!this.cockpit.model) return false;
    this.cockpit.model.getWorldPosition(this._cockpitPos);
    if (this._cockpitPos.z === 0) return false;
    this.positionCaptured = true;
    return true;
  }

  public spawnEnemy(): void {
    // ✅ الشيك جوا spawnEnemy نفسها — لو مش جاهز يحاول يبدأ
    if (!this.modelReady || !this.model || !this.cockpit.model) return;

    if (!this.positionCaptured) {
      if (!this.tryInitSpawnPos()) {
        // لو لسه مش جاهز، استنى frame وحاول تاني
        setTimeout(() => this.spawnEnemy(), 200);
        return;
      }
    }

    // ✅ كل طيارة تاخد offset عشوائي مختلف — مش slots ثابتة
    const offsetX = (Math.random() * 2 - 1) * SPAWN_SPREAD_X;
    const offsetY = (Math.random() * 2 - 1) * 2000; // تنويع في الارتفاع بسيط

    this.cockpit.model.getWorldPosition(this._cockpitPos);
    this.cockpit.model.updateWorldMatrix(true, false);

    this._forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
    this._right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();

    this._spawnOrigin
      .copy(this._cockpitPos)
      .addScaledVector(this._forward, SPAWN_DISTANCE)
      .addScaledVector(this._right, offsetX);

    this._spawnOrigin.y = this._cockpitPos.y + offsetY;

    const enemy = this.model.clone(true);
    enemy.position.copy(this._spawnOrigin);

    enemy.userData.offsetX   = offsetX;
    enemy.userData.spawnTime = this.elapsedTime;
    enemy.userData.isDead    = false;

    // GLB forward axis is -X; lookAt aligns -Z to target, so rotate -90° Y to fix.
    enemy.lookAt(this._cockpitPos);
    enemy.rotateY(-Math.PI / 2);

    this.scene.add(enemy);
    this.enemies.push(enemy);
    this.spawnIndex++;

    // console.log(`[EnemyManager] Spawned enemy #${this.spawnIndex} at offsetX=${Math.round(offsetX)}`);
  }

  public getEnemies(): THREE.Object3D[] {
    return this.enemies;
  }

  public removeEnemy(enemy: THREE.Object3D): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx !== -1) {
      enemy.userData.isDead = true;
      this.scene.remove(enemy);
      this.enemies.splice(idx, 1);
    }
  }

  // ✅ Full reset — called by Engine.resetForReplay()
  public clearAll(): void {
    for (const e of this.enemies) {
      this.scene.remove(e);
    }
    this.enemies      = [];
    this.spawnIndex   = 0;
    this.elapsedTime  = 0;
    this.spawnQueue   = [];
    // Keep positionCaptured = true (cockpit is still loaded)
  }

  public update(delta: number): void {
    if (!this.modelReady) return;

    if (!this.positionCaptured) {
      this.tryInitSpawnPos();
      return;
    }

    this.elapsedTime += delta;

    while (this.spawnQueue.length > 0 && this.elapsedTime >= this.spawnQueue[0]) {
      this.spawnQueue.shift();
      this.spawnEnemy();
    }

    if (!this.cockpit.model) return;

    this.cockpit.model.getWorldPosition(this._cockpitPos);
    this.cockpit.model.updateWorldMatrix(true, false);

    this._forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
    this._right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy.userData.isDead) continue;

      const age = this.elapsedTime - (enemy.userData.spawnTime as number ?? 0);
      if (age < LAG_DURATION) continue;

      const currentSpeed = this.cockpit.currentSpeed || 255;
      const speedFactor  = THREE.MathUtils.mapLinear(currentSpeed, 200, 500, 1.2, 0.8);

      // ✅ كل طيارة بتلاحق بـ offset الخاص بيها — حتى لو اتولدت جديدة
      this._targetPos
        .copy(this._cockpitPos)
        .addScaledVector(this._forward, COMBAT_DISTANCE * speedFactor)
        .addScaledVector(this._right, enemy.userData.offsetX);

      this._targetPos.y = this._cockpitPos.y;

      const trackingSpeed = 0.02;
      enemy.position.lerp(this._targetPos, delta * trackingSpeed * 20);

      // توجيه العدو للكوكبت بسلاسة
      this._targetQuat.copy(enemy.quaternion);
      enemy.lookAt(this._cockpitPos);
      this._targetQuat.copy(enemy.quaternion);
      enemy.quaternion.slerp(this._targetQuat, delta * 1.5);
      enemy.rotateY(-Math.PI / 2);
    }
  }
}