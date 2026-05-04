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
    // private readonly sideLocalPos  = new THREE.Vector3(-9, -2, 10);
    private readonly sideLocalPos  = new THREE.Vector3(-9, -3, 10);
    private readonly frontLocalPos = new THREE.Vector3(-20, 0, -10);

    private pendingAppear = false;
    private pendingMoveToSide = false;

    // Smooth lerp state — all in LOCAL space (model stays child of cockpit)
    private currentLocalPos = new THREE.Vector3();
    private targetLocalPos  = new THREE.Vector3();
    private isLerping       = false;
    private readonly LERP_SPEED = 0.04; // بطيء شوية عشان اللاج يبان

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

        loader.load('/models/low_poly_tplane.glb', (gltf) => {
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
            this.currentLocalPos.copy(this.sideLocalPos);
            this.targetLocalPos.copy(this.sideLocalPos);
            this.model.visible = false;

            // console.log('[TransitionPlane] Loaded and attached to cockpit.');

            if (this.pendingAppear) {
                this.pendingAppear = false;
                this.appearInFront();
            }
        }, undefined, (err) => {
            console.error('[TransitionPlane] Load error:', err);
        });
    }

    public appearInFront(): void {
        if (!this.model) {
            this.pendingAppear = true;
            return;
        }

        // ← ضيف الـ reattach هنا دايماً مش بس لو parent مختلف
        const cockpitModel = this.cockpit.model;
        if (!cockpitModel) {
            this.pendingAppear = true;
            console.warn('[TransitionPlane] Cockpit model not ready yet!');
            return;
        }

        // شيل من أي parent قديم وضيفه للكوكبت
        if (this.model.parent !== cockpitModel) {
            this.model.parent?.remove(this.model);
            cockpitModel.add(this.model);
        }

        this.isLerping = false;

        // Snap الـ current وال target للـ front position
        this.currentLocalPos.copy(this.frontLocalPos);
        this.targetLocalPos.copy(this.frontLocalPos);
        this.model.position.copy(this.frontLocalPos);
        // this.model.rotation.set(0, -Math.PI * 1.5 - Math.PI / 2, 0); // ← مهم عشان يبص للأمام
        this.model.rotation.set(0, Math.PI, 0); // ← مهم عشان يبص للأمام
        this.model.visible = true;
    }

    /** Smoothly move to right-side formation with lag effect — stays child of cockpit */
    public moveToSide(): void {
        if (!this.model) {
            this.pendingMoveToSide = true;
            return;
        }

        const cockpitModel = this.cockpit.model;
        if (!cockpitModel) return;

        // تأكد إن الموديل child of cockpit
        if (this.model.parent !== cockpitModel) {
            this.model.parent?.remove(this.model);
            cockpitModel.add(this.model);
        }

        // this.model.rotation.set(0, -Math.PI * 1.5 - Math.PI / 2, 0);
        this.model.rotation.set(0, Math.PI, 0);

        // ابدأ الـ lerp من الـ position الحالية للـ side
        this.currentLocalPos.copy(this.model.position);
        this.targetLocalPos.copy(this.sideLocalPos);
        this.isLerping = true;

        // console.log('[TransitionPlane] Lerping to side formation.');
    }

    /** Snap back and hide (called on replay reset) */
    public snapToCockpit(): void {
        if (!this.model) return;
        this.isLerping = false;
        this.currentLocalPos.copy(this.sideLocalPos);
        this.targetLocalPos.copy(this.sideLocalPos);
        this.model.position.copy(this.sideLocalPos);
        // this.model.rotation.set(0, -Math.PI * 1.5 - Math.PI / 2, 0);
        this.model.rotation.set(0, Math.PI, 0);
    }

    /** Hide and reset */
    public reset(): void {
        this.pendingAppear      = false;
        this.pendingMoveToSide  = false;
        this.isLerping          = false;
        if (this.model) {
            this.model.visible = false;
            this.currentLocalPos.copy(this.sideLocalPos);
            this.targetLocalPos.copy(this.sideLocalPos);
            this.model.position.copy(this.sideLocalPos);
        }
    }

    public update(): void {
        if (!this.model) return;

        // Lerp في local space — الموديل لسه child of cockpit فبيتبعه تلقائياً
        // وفي نفس الوقت بيعمل lag ناعم نحو الـ target
        if (this.isLerping) {
            this.currentLocalPos.lerp(this.targetLocalPos, this.LERP_SPEED);
            this.model.position.copy(this.currentLocalPos);

            if (this.currentLocalPos.distanceTo(this.targetLocalPos) < 0.05) {
                this.model.position.copy(this.targetLocalPos);
                this.currentLocalPos.copy(this.targetLocalPos);
                this.isLerping = false;
                // console.log('[TransitionPlane] Reached side formation.');
            }
        }
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