import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Cockpit } from './Cockpit';

export class EnemyManager {
    private scene: THREE.Scene;
    private cockpit: Cockpit;
    private enemies: THREE.Object3D[] = [];
    private model: THREE.Object3D | null = null;
    private readonly TOTAL_ENEMIES = 7;
    private readonly SPAWN_INTERVAL = 5;
    private spawnQueue: number[] = [];
    private elapsedTime = 0;
    private modelReady = false;
    private positionCaptured = false;
    private fixedSpawnPos = new THREE.Vector3();
    // ✅ track how many enemies spawned
    private spawnIndex = 0;

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, cockpit: Cockpit) {
        this.scene = scene;
        this.cockpit = cockpit;
        this.loadModel();
    }

    private loadModel() {
        const loader = new GLTFLoader();
        loader.load('/models/enemy.glb', (gltf) => {
            this.model = gltf.scene;
            this.model.scale.set(160, 160, 160);
            this.modelReady = true;
            console.log('✅ Enemy model loaded');
        }, undefined, (err) => {
            console.error('❌ Enemy load error:', err);
        });
    }

    private tryInitSpawnPos(): boolean {
        if (!this.cockpit.model) return false;
        const cockpitPos = new THREE.Vector3();
        this.cockpit.model.getWorldPosition(cockpitPos);
        if (cockpitPos.z === 0) return false;
        this.fixedSpawnPos.set(
            cockpitPos.x + 10000,
            cockpitPos.y + 200,
            cockpitPos.z + 30000
        );
        for (let i = 0; i < this.TOTAL_ENEMIES; i++) {
            this.spawnQueue.push(this.elapsedTime + i * this.SPAWN_INTERVAL);
        }
        this.positionCaptured = true;
        console.log('✅ Spawn pos locked:', this.fixedSpawnPos);
        return true;
    }

    private spawnEnemy() {
        if (!this.model) return;
        const enemy = this.model.clone(true);
        const spawnPos = this.fixedSpawnPos.clone();
        spawnPos.z += this.spawnIndex * 10000;
        enemy.position.copy(spawnPos);
        enemy.userData.travelDir = new THREE.Vector3(-1, 0, 0);
        enemy.userData.speed = 2500;
        enemy.userData.distanceTraveled = 0;
        this.scene.add(enemy);
        this.enemies.push(enemy);
        console.log(`✅ Plane ${this.spawnIndex + 1} spawned at Z: ${spawnPos.z}`);
        this.spawnIndex++;
    }

    // ── Two small public hooks for CombatSystem ──────────────────────────
    /** Read-only access so CombatSystem can check positions & HP */
    public getEnemies(): THREE.Object3D[] {
        return this.enemies;
    }

    /** CombatSystem calls this when an enemy reaches 0 HP */
    public removeEnemy(enemy: THREE.Object3D): void {
        const idx = this.enemies.indexOf(enemy);
        if (idx !== -1) {
            this.scene.remove(enemy);
            this.enemies.splice(idx, 1);
        }
    }
    // ─────────────────────────────────────────────────────────────────────

    public update(delta: number) {
        if (!this.modelReady) return;
        if (!this.positionCaptured) {
            this.tryInitSpawnPos();
            return;
        }
        this.elapsedTime += delta;
        while (
            this.spawnQueue.length > 0 &&
            this.elapsedTime >= this.spawnQueue[0]
        ) {
            this.spawnQueue.shift();
            this.spawnEnemy();
        }
        const cockpitPos = new THREE.Vector3();
        if (this.cockpit.model) {
            this.cockpit.model.getWorldPosition(cockpitPos);
        }
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const movement = enemy.userData.speed * delta;
            enemy.position.addScaledVector(enemy.userData.travelDir, movement);
            enemy.userData.distanceTraveled += movement;
            enemy.lookAt(cockpitPos);
            if (enemy.userData.distanceTraveled > 40000) {
                this.scene.remove(enemy);
                this.enemies.splice(i, 1);
                console.log('🗑️ Plane removed after crossing screen');
            }
        }
    }
}