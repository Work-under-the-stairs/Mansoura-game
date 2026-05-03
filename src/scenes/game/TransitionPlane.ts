import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Cockpit } from './Cockpit';

export class TransitionPlane {
    public model: THREE.Group | null = null;
    private readonly isMobile =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        navigator.maxTouchPoints > 1;

    /**
     * Offsets in the cockpit's LOCAL space.
     * Front: Directly in front of the pilot's view.
     * Side: Formation position to the right.
     */
    private readonly frontOffset = new THREE.Vector3(0, -200, -6000);
    private readonly sideOffset  = new THREE.Vector3(2500, -100, -4000);
    
    private currentOffset = new THREE.Vector3().copy(this.frontOffset);
    private readonly lerpAlpha = 0.04; // Smooth movement

    private readonly _mat        = new THREE.Matrix4();
    private readonly _targetPos  = new THREE.Vector3();
    private readonly _targetQuat = new THREE.Quaternion();

    constructor(
        private readonly scene:          THREE.Scene,
        private readonly loadingManager: THREE.LoadingManager,
        private readonly cockpit:        Cockpit
    ) {
        this.loadModel();
    }

    private get cm(): THREE.Group | null {
        return this.cockpit.model ?? null;
    }

    private loadModel(): void {
        const loader = new GLTFLoader(this.loadingManager);
        const draco  = new DRACOLoader(this.loadingManager);
        draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(draco);

        loader.load(
            '/models/plane.glb',
            (gltf) => {
                this.model = gltf.scene;
                this.model.traverse((child) => {
                    const mesh = child as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    if (!this.isMobile) {
                        mesh.castShadow    = true;
                        mesh.receiveShadow = true;
                    }
                    if (mesh.material instanceof THREE.MeshStandardMaterial) {
                        mesh.material.roughness = 0.6;
                    }
                });
                this.scene.add(this.model);
                this.model.visible = false; // Hidden until Level 2 starts
                this.snapToCockpit();
            },
            undefined,
            (err) => console.error('[TransitionPlane] Load error:', err)
        );
    }

    /** Set position to front and make visible */
    public appearInFront(): void {
        this.currentOffset.copy(this.frontOffset);
        if (this.model) {
            this.model.visible = true;
            this.snapToCockpit();
        }
    }

    /** Start moving to the side position */
    public moveToSide(): void {
        this.currentOffset.copy(this.sideOffset);
    }

    /** Hide and reset for game restart */
    public reset(): void {
        this.currentOffset.copy(this.frontOffset);
        if (this.model) {
            this.model.visible = false;
            this.snapToCockpit();
        }
    }

    public snapToCockpit(): void {
        const cockpitModel = this.cm;
        if (!this.model || !cockpitModel) return;
        cockpitModel.updateWorldMatrix(true, false);
        this._mat.copy(cockpitModel.matrixWorld);
        this._targetPos.copy(this.currentOffset).applyMatrix4(this._mat);
        this.model.position.copy(this._targetPos);
        cockpitModel.getWorldQuaternion(this._targetQuat);
        this.model.quaternion.copy(this._targetQuat);
    }

    public update(): void {
        const cockpitModel = this.cm;
        if (!this.model || !cockpitModel || !this.model.visible) return;

        cockpitModel.updateWorldMatrix(true, false);
        this._mat.copy(cockpitModel.matrixWorld);
        this._targetPos.copy(this.currentOffset).applyMatrix4(this._mat);
        this.model.position.lerp(this._targetPos, this.lerpAlpha);
        cockpitModel.getWorldQuaternion(this._targetQuat);
        this.model.quaternion.slerp(this._targetQuat, this.lerpAlpha);
    }

    public dispose(): void {
        if (!this.model) return;
        this.scene.remove(this.model);
        this.model = null;
    }
}
