import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Cockpit } from './Cockpit';

// ─── Tuning constants ────────────────────────────────────────────────────────

const SPAWN_DISTANCE = 40_000;
const COMBAT_DISTANCE = 15_000;
const SPAWN_SPREAD_X = 10_000;

const BASE_SCALE       = 160;
const MIN_SCALE_FACTOR = 0.5;
const MAX_SCALE_FACTOR = 2.5;

const LAG_DURATION = 3;

// ────────────────────────────────────────────────────────────────────────────

export class EnemyManager {
    private scene:   THREE.Scene;
    private cockpit: Cockpit;

    private enemies:    THREE.Object3D[] = [];
    private model:      THREE.Object3D | null = null;
    private modelReady  = false;

    private readonly TOTAL_ENEMIES  = 3;
    private readonly SPAWN_INTERVAL = 2;

    private spawnQueue:       number[] = [];
    private elapsedTime       = 0;
    private positionCaptured  = false;
    private spawnIndex        = 0;

    // ✅ Store the first-ever spawn origin so replay reuses exact same position
    private firstSpawnCockpitPos: THREE.Vector3 | null = null;
    private firstSpawnForward:    THREE.Vector3 | null = null;
    private firstSpawnRight:      THREE.Vector3 | null = null;

    private readonly _cockpitPos  = new THREE.Vector3();
    private readonly _forward     = new THREE.Vector3();
    private readonly _right       = new THREE.Vector3();
    private readonly _up          = new THREE.Vector3();
    private readonly _spawnOrigin = new THREE.Vector3();
    private readonly _targetPos   = new THREE.Vector3();

    constructor(scene: THREE.Scene, _camera: THREE.PerspectiveCamera, cockpit: Cockpit) {
        this.scene   = scene;
        this.cockpit = cockpit;
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
                console.log('✅ Enemy model loaded');
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
        if (!this.model || !this.cockpit.model) return;

        // ✅ On first-ever spawn, capture & store cockpit state
        // On replay, reuse the stored state so positions are identical
        if (!this.firstSpawnCockpitPos) {
            // First run — capture live cockpit state and save it
            this.cockpit.model.getWorldPosition(this._cockpitPos);
            this.cockpit.model.updateWorldMatrix(true, false);

            this._forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
            this._right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();
            this._up.setFromMatrixColumn(this.cockpit.model.matrixWorld, 1).normalize();

            // Save for all future replays
            this.firstSpawnCockpitPos = this._cockpitPos.clone();
            this.firstSpawnForward    = this._forward.clone();
            this.firstSpawnRight      = this._right.clone();
        } else {
            // Replay — use the saved first-run values exactly
            this._cockpitPos.copy(this.firstSpawnCockpitPos);
            this._forward.copy(this.firstSpawnForward!);
            this._right.copy(this.firstSpawnRight!);
        }

        // Same slot logic as before — but spawnIndex is now reset on replay
        // so slot 0 and slot 1 are always the same two positions
        const slotWidth = (SPAWN_SPREAD_X * 2) / this.TOTAL_ENEMIES;
        const slotStart = -SPAWN_SPREAD_X + this.spawnIndex * slotWidth;
        const jitter    = (Math.random() * 2 - 1) * slotWidth * 0.2;
        const offsetX   = slotStart + slotWidth * 0.5 + jitter;

        this._spawnOrigin
            .copy(this._cockpitPos)
            .addScaledVector(this._forward, SPAWN_DISTANCE)
            .addScaledVector(this._right, offsetX);

        this._spawnOrigin.y = this._cockpitPos.y;

        const enemy = this.model.clone(true);
        enemy.position.copy(this._spawnOrigin);

        enemy.userData.offsetX   = offsetX;
        enemy.userData.spawnTime = this.elapsedTime;


        // enemy.userData.hitbox = new THREE.Box3();
        
        // Initial look at cockpit

        enemy.lookAt(this._cockpitPos);
        enemy.rotateY(Math.PI / 2);

        this.scene.add(enemy);
        this.enemies.push(enemy);
        this.spawnIndex++;
    }

    public getEnemies(): THREE.Object3D[] {
        return this.enemies;
    }

    public removeEnemy(enemy: THREE.Object3D): void {
        const idx = this.enemies.indexOf(enemy);
        if (idx !== -1) {
            this.scene.remove(enemy);
            this.enemies.splice(idx, 1);
        }
    }

    // ✅ Full reset — called by Engine.resetForReplay()
    public clearAll(): void {
        // Remove every enemy mesh from the scene
        for (const e of this.enemies) {
            this.scene.remove(e);
        }
        this.enemies = [];

        // Reset spawn index so first two enemies land in slot 0 and slot 1 again
        this.spawnIndex = 0;

        // Reset time and queue
        this.elapsedTime      = 0;
        this.spawnQueue       = [];

        // Keep positionCaptured = true (cockpit is still loaded)
        // Keep firstSpawnCockpitPos — we WANT to reuse the original spawn origin
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

        if (this.cockpit.model) {
            this.cockpit.model.getWorldPosition(this._cockpitPos);
            this.cockpit.model.updateWorldMatrix(true, false);

            this._forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
            this._right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();
            this._up.setFromMatrixColumn(this.cockpit.model.matrixWorld, 1).normalize();

            for (let i = 0; i < this.enemies.length; i++) {
                const enemy = this.enemies[i];

                if (enemy.userData.isDead) continue;

                const age = this.elapsedTime - (enemy.userData.spawnTime as number ?? 0);
                if (age < LAG_DURATION) continue;

                this._targetPos
                    .copy(this._cockpitPos)
                    .addScaledVector(this._forward, COMBAT_DISTANCE)
                    .addScaledVector(this._right, enemy.userData.offsetX);

                this._targetPos.y = this._cockpitPos.y;

                // Smoothly follow the target position
                // enemy.position.lerp(this._targetPos, delta * 1.2); 
                
                // const trackingSpeed = THREE.MathUtils.clamp((age - LAG_DURATION) * 0.08, 0.02, 0.15);
                // enemy.position.lerp(this._targetPos, delta * trackingSpeed * 60);
                const trackingSpeed = THREE.MathUtils.clamp((age - LAG_DURATION) * 0.04, 0.01, 0.05);
                enemy.position.lerp(this._targetPos, delta * trackingSpeed * 40);

                // const targetQuaternion = new THREE.Quaternion();
                // const dummy = new THREE.Object3D();
                // dummy.position.copy(enemy.position);
                // dummy.lookAt(this._cockpitPos);
                // targetQuaternion.copy(dummy.quaternion);

                // // الدوران بنسبة 5% فقط في الفريم الواحد يجعله يراوغ ببطء "منطقي"
                // enemy.quaternion.slerp(targetQuaternion, delta * 2.0); 
                // enemy.rotateY(Math.PI / 2); // الحفاظ على اتجاه الموديل الأصلي[cite: 2]

                const targetQuaternion = enemy.quaternion.clone();

                enemy.lookAt(this._cockpitPos);
                targetQuaternion.copy(enemy.quaternion);
                enemy.quaternion.slerp(targetQuaternion, delta * 2.0);
                // Face the cockpit directly
                // enemy.lookAt(this._cockpitPos);
                enemy.rotateY(Math.PI / 2);

                const distRatio   = THREE.MathUtils.clamp(COMBAT_DISTANCE / SPAWN_DISTANCE, 0, 1);
                const scaleFactor = THREE.MathUtils.lerp(MAX_SCALE_FACTOR, MIN_SCALE_FACTOR, distRatio);
                enemy.scale.setScalar(BASE_SCALE * scaleFactor);
            }
        }
    }
}