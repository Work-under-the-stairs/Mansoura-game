import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

export class TransitionPlane {
    public model: THREE.Group | null = null;
    private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

    constructor(
        private scene: THREE.Scene,
        private loadingManager: THREE.LoadingManager,
        private cockpitModel: THREE.Group // Reference to the cockpit to follow
    ) {
        this.loadModel();
    }

    private loadModel(): void {
        const loader = new GLTFLoader(this.loadingManager);
        const dracoLoader = new DRACOLoader(this.loadingManager);
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        loader.setDRACOLoader(dracoLoader);

        // Using the same model as the cockpit for the transition plane as requested
        loader.load('/models/cockpitshit34.glb', (gltf) => {
            this.model = gltf.scene;
            this.scene.add(this.model);

            this.model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    if (!this.isMobile) {
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                    }
                    if (mesh.material instanceof THREE.MeshStandardMaterial) {
                        mesh.material.roughness = 0.6;
                    }
                }
            });

            console.log('Transition Plane Loaded!');
        },
        (progress) => {
            console.log(`Transition Plane Loading: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
        },
        (error) => {
            console.error('Error loading transition plane:', error);
        });
    }

    /**
     * Updates the transition plane's position and rotation to fly next to the cockpit.
     * It mirrors the cockpit's transformation with a fixed offset.
     */
    public update(): void {
        if (!this.model || !this.cockpitModel) return;

        // Define the offset (e.g., 15 units to the right and slightly behind/above)
        // Adjust these values to position the plane exactly where you want it relative to the cockpit
        const offset = new THREE.Vector3(15, 2, -5);
        
        // Apply the cockpit's world matrix to the offset to get the target world position
        const targetPosition = offset.clone().applyMatrix4(this.cockpitModel.matrixWorld);
        
        // Update position
        this.model.position.copy(targetPosition);
        
        // Match the cockpit's rotation
        this.model.quaternion.copy(this.cockpitModel.quaternion);
    }
}
