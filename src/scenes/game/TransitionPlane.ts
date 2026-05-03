import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Cockpit } from './Cockpit';

export class TransitionPlane {
    public model: THREE.Group | null = null;

    private readonly isMobile =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        navigator.maxTouchPoints > 1;

    // Position in cockpit's LOCAL space — child of cockpit so it always follows
    // SIDE: right of cockpit, same height, slightly behind → always in view
    private readonly sideLocalPos  = new THREE.Vector3(1500, 0, 500);
    private readonly frontLocalPos = new THREE.Vector3(0, 0, -2000);

    private pendingAppear = false;
    private pendingMoveToSide = false;

    constructor(
        private readonly scene: THREE.Scene,
        private readonly loadingManager: THREE.LoadingManager,
        private readonly cockpit: Cockpit
    ) {
        this.loadModel();
    }

    private loadModel(): void {
        // Use a fresh independent loader — the shared loadingManager is already
        // "done" by the time Level 2 starts, so its callbacks never fire.
        const loader = new GLTFLoader();
        const draco  = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(draco);

        loader.load('/models/plane.glb', (gltf) => {
            this.model = gltf.scene;
            this.model.scale.setScalar(0.75);

            this.model.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (!mesh.isMesh) return;
                if (!this.isMobile) {
                    mesh.castShadow    = true;
                    mesh.receiveShadow = true;
                }
            });

            // ── KEY CHANGE: add as CHILD of cockpit model ──────────────────
            // This means the wingman inherits all cockpit transforms for free.
            // No matrix math needed — just set local position.
            const cockpitModel = this.cockpit.model;
            if (cockpitModel) {
                cockpitModel.add(this.model);
            } else {
                // Cockpit model not ready yet — add to scene and reattach later
                this.scene.add(this.model);
            }

            // Start hidden at side position
            this.model.position.copy(this.sideLocalPos);
            this.model.visible = false;

            console.log('[TransitionPlane] Loaded and attached to cockpit.');

            if (this.pendingAppear) {
                this.pendingAppear = false;
                this.appearInFront();
            }
        }, undefined, (err) => {
            console.error('[TransitionPlane] Load error:', err);
        });
    }

    /** Snap to front of cockpit and show */
    public appearInFront(): void {
        if (!this.model) {
            this.pendingAppear = true;
            console.warn('[TransitionPlane] appearInFront — model not ready, deferred.');
            return;
        }

        // Re-attach to cockpit if it wasn't ready during load
        const cockpitModel = this.cockpit.model;
        if (cockpitModel && this.model.parent !== cockpitModel) {
            this.scene.remove(this.model);
            cockpitModel.add(this.model);
        }

        this.model.position.copy(this.frontLocalPos);
        this.model.rotation.set(0, 0, 0);
        this.model.visible = true;
        console.log('[TransitionPlane] Visible — in front of cockpit.');
    }

    /** Instantly move to right-side formation position */
    public moveToSide(): void {
        if (!this.model) {
            this.pendingMoveToSide = true;
            return;
        }
        this.model.position.copy(this.sideLocalPos);
        console.log('[TransitionPlane] Moved to side formation.');
    }

    /** Snap back and hide (called on replay reset) */
    public snapToCockpit(): void {
        if (!this.model) return;
        this.model.position.copy(this.sideLocalPos);
    }

    /** Hide and reset */
    public reset(): void {
        this.pendingAppear     = false;
        this.pendingMoveToSide = false;
        if (this.model) {
            this.model.visible = false;
            this.model.position.copy(this.sideLocalPos);
        }
    }

    /** Engine calls this every frame — no-op now since model is a cockpit child */
    public update(): void {
        // Nothing needed — child inherits parent transform automatically
    }

    public dispose(): void {
        if (!this.model) return;
        if (this.model.parent) {
            this.model.parent.remove(this.model);
        } else {
            this.scene.remove(this.model);
        }
        this.model = null;
    }
}
