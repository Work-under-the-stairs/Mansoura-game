import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Cockpit } from './Cockpit';

// ─── Tuning constants ────────────────────────────────────────────────────────

/** How far ahead of the cockpit (in world units) each enemy spawns. */
const SPAWN_DISTANCE = 40_000;

/** The specific distance enemies try to maintain from the cockpit. */
const COMBAT_DISTANCE = 15_000;

/** 
 * Spread for spawning. 
 * Reduced Y spread to make them appear at a "smaller height" (lower elevation).
 */
const SPAWN_SPREAD_X = 10_000;
const SPAWN_SPREAD_Y = 1_000; 

/** Visual scale constants */
const BASE_SCALE       = 160;
const MIN_SCALE_FACTOR = 0.5;
const MAX_SCALE_FACTOR = 2.5;

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

    // Reusable vectors
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
            '/models/enemy.glb',
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
        for (let i = 0; i < this.TOTAL_ENEMIES; i++) {
            this.spawnQueue.push(this.elapsedTime + i * this.SPAWN_INTERVAL);
        }
        return true;
    }

    private spawnEnemy(): void {
        if (!this.model || !this.cockpit.model) return;

        this.cockpit.model.getWorldPosition(this._cockpitPos);
        this.cockpit.model.updateWorldMatrix(true, false);
        
        this._forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
        this._right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();
        this._up.setFromMatrixColumn(this.cockpit.model.matrixWorld, 1).normalize();

        // Random horizontal offset, fixed downward vertical offset
        const offsetX = (Math.random() * 2 - 1) * SPAWN_SPREAD_X;
        const offsetY = -2000 - (Math.random() * SPAWN_SPREAD_Y); // Always below cockpit

        this._spawnOrigin
            .copy(this._cockpitPos)
            .addScaledVector(this._forward, SPAWN_DISTANCE)
            .addScaledVector(this._right, offsetX)
            .addScaledVector(this._up, offsetY);

        const enemy = this.model.clone(true);
        enemy.position.copy(this._spawnOrigin);

        // Save relative offsets to maintain them during follow
        enemy.userData.offsetX = offsetX;
        enemy.userData.offsetY = offsetY;
        
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
            
            // Re-calculate world vectors for the cockpit
            this._forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
            this._right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();
            this._up.setFromMatrixColumn(this.cockpit.model.matrixWorld, 1).normalize();

            for (let i = 0; i < this.enemies.length; i++) {
                const enemy = this.enemies[i];
                
                // Target position = Cockpit + Forward Distance + Lateral Offset + Vertical Offset
                this._targetPos.copy(this._cockpitPos)
                    .addScaledVector(this._forward, COMBAT_DISTANCE)
                    .addScaledVector(this._right, enemy.userData.offsetX)
                    .addScaledVector(this._up, enemy.userData.offsetY);

                // Smoothly follow the target position
                // Higher lerp factor for tighter following
                enemy.position.lerp(this._targetPos, delta * 3); 

                // Face the cockpit directly
                enemy.lookAt(this._cockpitPos);
                enemy.rotateY(Math.PI / 2);

                // Stable scaling: since they stay at COMBAT_DISTANCE, 
                // we use a fixed scale based on that distance.
                const distRatio = THREE.MathUtils.clamp(COMBAT_DISTANCE / SPAWN_DISTANCE, 0, 1);
                const scaleFactor = THREE.MathUtils.lerp(MAX_SCALE_FACTOR, MIN_SCALE_FACTOR, distRatio);
                enemy.scale.setScalar(BASE_SCALE * scaleFactor);
            }
        }
    }
}
