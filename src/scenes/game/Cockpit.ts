import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Controls } from './Controls';

export class Cockpit {
    public model: THREE.Group | null = null;
    
    private rotationSpeed = {
        pitch: 0,
        roll: 0
    };

    private config = {
        sensitivity: 0.0005,
        damping: 0.95,
        maxRotationSpeed: 0.03
    };

    constructor(
        private scene: THREE.Scene, 
        private camera: THREE.PerspectiveCamera, 
        private controls: Controls
    ) {
        this.loadModel();
    }

    private loadModel() {
        const loader = new GLTFLoader();
        
        loader.load('/models/myCockpit.glb', (gltf) => {
            this.model = gltf.scene;
            this.scene.add(this.model);
            
            this.model.position.set(450, 1450, 6200); 

            this.model.add(this.camera);

            this.camera.position.set(0, 0.166, -0.276);
            this.camera.lookAt(0, 0, 0.276);
            this.camera.rotation.y = Math.PI;


            const dashLight = new THREE.SpotLight(0xffffff, 5);
            dashLight.position.set(0, 0.5, -0.5);
            dashLight.angle = Math.PI / 3; 
            dashLight.penumbra = 0.3;
            dashLight.decay = 1.5;
            dashLight.distance = 5;

            const lightTarget = new THREE.Object3D();
            lightTarget.position.set(0, 0, 0.5);
            
            this.model.add(dashLight);
            this.model.add(lightTarget);
            dashLight.target = lightTarget;

            const ambientCabinLight = new THREE.PointLight(0x88ccff, 0.8, 3);
            ambientCabinLight.position.set(0, 0.2, 0);
            this.model.add(ambientCabinLight);

            this.model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    if (mesh.material instanceof THREE.MeshStandardMaterial) {
                        mesh.material.roughness = 0.6;
                    }
                }
            });

            console.log('Cockpit Loaded & Illuminated!');
        }, 
        (progress) => {
            console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
        },
        (error) => {
            console.error('Error loading cockpit:', error);
        });
    }

    public update() {
        if (!this.model) return;

        const keys = this.controls.keys;

        // Handle Pitch (Up/Down)
        if (keys['ArrowUp']) {
            this.rotationSpeed.pitch = Math.max(this.rotationSpeed.pitch - this.config.sensitivity, -this.config.maxRotationSpeed);
        }
        if (keys['ArrowDown']) {
            this.rotationSpeed.pitch = Math.min(this.rotationSpeed.pitch + this.config.sensitivity, this.config.maxRotationSpeed);
        }

        // Handle Roll (Left/Right)
        if (keys['ArrowLeft']) {
            this.rotationSpeed.roll = Math.min(this.rotationSpeed.roll + this.config.sensitivity, this.config.maxRotationSpeed);
        }
        if (keys['ArrowRight']) {
            this.rotationSpeed.roll = Math.max(this.rotationSpeed.roll - this.config.sensitivity, -this.config.maxRotationSpeed);
        }

        // Apply Damping (Slowly stop rotation when keys are released)
        this.rotationSpeed.pitch *= this.config.damping;
        this.rotationSpeed.roll *= this.config.damping;

        // Apply Rotations to the model
        this.model.rotateX(this.rotationSpeed.pitch);
        this.model.rotateZ(this.rotationSpeed.roll);

        // Optional: Constant forward movement to feel the flight
        const forwardSpeed = 0.2;
        this.model.translateZ(forwardSpeed);
    }
}