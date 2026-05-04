import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Controls } from './Controls';
import { WeaponSystem } from './WeaponSystem';
import { ProjectileManager } from './ProjectileManager';

export class Cockpit {
    public model: THREE.Group | null = null;
    public weaponSystem: WeaponSystem | null = null;
    public currentSpeed = 400;

    private rotationSpeed = { pitch: 0, roll: 0 };

    private angles = { pitch: 0, yaw: 0, roll: 0 };

    private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

    private config = {
        sensitivity:      0.0006,
        damping:          0.94,
        maxRotationSpeed: 0.04,
        minSpeed:         400,
        maxSpeed:         600,
        acceleration:     0.03,
        maxPitch:         Math.PI * 0.4,
        maxRoll:          Math.PI * 0.35,
    };

    // ✅ Altitude floor settings
    private altitudeConfig = {
        // Minimum height above terrain (world units). Cockpit cannot go below this.
        minHeightAboveTerrain: 300,

        // How aggressively the cockpit is pushed back up when below the floor.
        // Higher = snappier recovery, lower = gentler push.
        floorRepelStrength: 0.12,

        // If the cockpit is within this distance above the floor, start tilting
        // the nose up automatically to warn / prevent clipping.
        warningZone: 600,

        // Max pitch correction applied when approaching the floor (radians).
        maxFloorPitchCorrection: 0.18,
    };

    // ✅ Callback that Engine wires up so Cockpit can query terrain height.
    // Set this after construction: cockpit.getTerrainHeight = (x, z) => engine.getGroundHeight(x, z);
    public getTerrainHeight: ((x: number, z: number) => number) | null = null;

    constructor(
        private scene:              THREE.Scene,
        private camera:             THREE.PerspectiveCamera,
        private controls:           Controls,
        private loadingManager:     THREE.LoadingManager,
        private projectileManager:  ProjectileManager,
    ) {
        this.loadModel();
    }

    private loadModel(): void {
        const loader = new GLTFLoader(this.loadingManager);

        const dracoLoader = new DRACOLoader(this.loadingManager);
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

        loader.setDRACOLoader(dracoLoader);

        loader.load('/models/cockpitshit34.glb', (gltf) => {
            this.model = gltf.scene;
            this.scene.add(this.model);

            // Attach camera
            this.model.add(this.camera);
            this.camera.position.set(0, 0.24, -0.2);
            this.camera.lookAt(0, 0.34, 0.2);

            // ✅ Model is guaranteed loaded here — safe to create WeaponSystem
            this.weaponSystem = new WeaponSystem(
                this.scene,
                this.model,
                this.controls,
                this.projectileManager,
            );

            // console.log('Cockpit Loaded & Flight Ready!');
        },
        (progress) => {
            // console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
        },
        (error) => {
            // console.error('Error loading cockpit:', error);
        });
    }

    private readonly _worldPos = new THREE.Vector3();

    public update(delta: number): void {
        if (!this.model) return;

        const keys = this.controls.keys;

        // ── Speed ────────────────────────────────────────────────────────────
        if (keys['ShiftLeft'] || keys['ShiftRight']) {
            this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.config.maxSpeed, this.config.acceleration);
        } else {
            this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.config.minSpeed, this.config.acceleration * 0.5);
        }

        // ── Rotation input accumulation ───────────────────────────────────────
        if (keys['ArrowUp']) {
            this.rotationSpeed.pitch = Math.max(this.rotationSpeed.pitch - this.config.sensitivity, -this.config.maxRotationSpeed);
        }
        if (keys['ArrowDown']) {
            this.rotationSpeed.pitch = Math.min(this.rotationSpeed.pitch + this.config.sensitivity, this.config.maxRotationSpeed);
        }
        if (keys['ArrowLeft']) {
            this.rotationSpeed.roll = Math.max(this.rotationSpeed.roll - this.config.sensitivity, -this.config.maxRotationSpeed);
        }
        if (keys['ArrowRight']) {
            this.rotationSpeed.roll = Math.min(this.rotationSpeed.roll + this.config.sensitivity, this.config.maxRotationSpeed);
        }

        // ── Damping ───────────────────────────────────────────────────────────
        this.rotationSpeed.pitch *= this.config.damping;
        this.rotationSpeed.roll  *= this.config.damping;

        // ── Accumulate angles with clamp ─────────────────────────────────────
        this.angles.pitch = THREE.MathUtils.clamp(
            this.angles.pitch + this.rotationSpeed.pitch,
            -this.config.maxPitch,
            this.config.maxPitch
        );
        this.angles.roll = THREE.MathUtils.clamp(
            this.angles.roll + this.rotationSpeed.roll,
            -this.config.maxRoll,
            this.config.maxRoll
        );

        // Yaw coupled to roll (natural flight feel)
        this.angles.yaw += -this.rotationSpeed.roll * 0.7;

        // Roll auto-return when no lateral key is held
        if (!keys['ArrowLeft'] && !keys['ArrowRight']) {
            this.angles.roll = THREE.MathUtils.lerp(this.angles.roll, 0, 0.05);
        }

        // ── Apply rotation ────────────────────────────────────────────────────
        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = this.angles.yaw;
        this.model.rotation.x = this.angles.pitch;
        this.model.rotation.z = this.angles.roll;

        // ── Forward movement ─────────────────────────────────────────────────
        this.model.translateZ(this.currentSpeed * delta);

        // ── ✅ ALTITUDE FLOOR ENFORCEMENT ────────────────────────────────────
        this.enforceMinAltitude(delta);

        // ── Weapons ───────────────────────────────────────────────────────────
        if (this.weaponSystem) {
            this.weaponSystem.setCockpitSpeed(this.currentSpeed);
            this.weaponSystem.update(delta);
        }
    }

    /**
     * Prevents the cockpit from flying below a minimum height above the terrain.
     *
     * - Queries the terrain height at the cockpit's current (x, z) position.
     * - Computes the minimum allowed Y = terrainY + minHeightAboveTerrain.
     * - If the cockpit is below (or very close to) that floor:
     *     1. Snaps the Y position up with a smooth lerp (no hard teleport).
     *     2. Cancels any downward pitch rotation so the player can't force-dive.
     *     3. Applies a gentle auto-pitch-up correction so the nose lifts naturally.
     * - The player can always fly UP from this height; only descent is blocked.
     */
    private enforceMinAltitude(delta: number): void {
        if (!this.model) return;

        const pos = this.model.position;
        const cfg = this.altitudeConfig;

        // Query terrain height at current position (fallback to 0 if not wired up)
        const groundY = this.getTerrainHeight
            ? this.getTerrainHeight(pos.x, pos.z)
            : 0;

        const floorY = groundY + cfg.minHeightAboveTerrain;
        const heightAboveFloor = pos.y - floorY;

        if (heightAboveFloor < 0) {
            // ── Hard floor: smoothly push cockpit back above the floor ──────────
            // lerp strength scales with how far below we are (more aggressive when deeper)
            const pushStrength = Math.min(1, cfg.floorRepelStrength + Math.abs(heightAboveFloor) * 0.0005);
            pos.y = THREE.MathUtils.lerp(pos.y, floorY, pushStrength);

            // Cancel downward pitch input so the player can't fight the floor
            if (this.rotationSpeed.pitch > 0) {
                this.rotationSpeed.pitch = 0;
            }
            // Force pitch angle toward zero (nose-up) so model visually recovers
            this.angles.pitch = THREE.MathUtils.lerp(this.angles.pitch, 0, 0.08);

        } else if (heightAboveFloor < cfg.warningZone) {
            // ── Warning zone: gently nudge nose up as we approach the floor ─────
            // Correction is proportional to how close we are (0 at edge of zone → max at floor)
            const proximity = 1 - (heightAboveFloor / cfg.warningZone); // 0..1
            const pitchCorrection = proximity * cfg.maxFloorPitchCorrection;

            // Only apply correction if the player is pitching DOWN; let them pitch up freely
            if (this.angles.pitch > -pitchCorrection) {
                this.angles.pitch = THREE.MathUtils.lerp(
                    this.angles.pitch,
                    -pitchCorrection,
                    0.04 * proximity
                );
            }
        }
    }
}
