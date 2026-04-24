import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Controls } from './Controls';

export class Cockpit {
    public model: THREE.Group | null = null;
    
    private rotationSpeed = {
        pitch: 0,
        roll: 0
    };

    private config = {
        sensitivity: 0.0006,   // Steering sensitivity
        damping: 0.94,         // How fast rotation stops
        maxRotationSpeed: 0.04,
        minSpeed: 155,         // Cruising speed
        maxSpeed: 200,         // Speed with Shift (Afterburner)
        acceleration: 0.03     // How fast it gains speed
    };

    private currentSpeed = 0.8;

    constructor(
        private scene: THREE.Scene, 
        private camera: THREE.PerspectiveCamera, 
        private controls: Controls,
        private loadingManager: THREE.LoadingManager
    ) {
        this.loadModel();
    }

    private loadModel() {
        const loader = new GLTFLoader(this.loadingManager);

        const dracoLoader = new DRACOLoader(this.loadingManager);
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); 
        loader.setDRACOLoader(dracoLoader);
        
        loader.load('/models/cockpitNew.glb', (gltf) => {
            this.model = gltf.scene;
            this.scene.add(this.model);
            
            // Set initial world position
            this.model.position.set(450, 1450, 6200); 
            

            // Attach camera to cockpit
            this.model.add(this.camera);

            // Verified camera alignment
            this.camera.position.set(0, 0.165, -0.276);
            this.camera.lookAt(0, 0, 0.276);
            this.camera.rotation.y = Math.PI;

            // --- Interior Lighting ---
            const dashLight = new THREE.SpotLight(0xffffff, 1);
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

            const ambientCabinLight = new THREE.PointLight(0x88ccff, 0.8, 1);
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

            console.log('Cockpit Loaded & Flight Ready!');
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

        // --- 1. Throttle Logic (Speed) ---
        // Boost speed if Shift is held, otherwise return to cruising speed
        if (keys['ShiftLeft'] || keys['ShiftRight']) {
            this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.config.maxSpeed, this.config.acceleration);
        } else {
            this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.config.minSpeed, this.config.acceleration * 0.5);
        }

        // --- 2. Pitch Control (Up/Down) ---
        // Inverted: ArrowDown pulls up (climb), ArrowUp pushes down (dive)
        if (keys['ArrowUp']) {
            this.rotationSpeed.pitch = Math.max(this.rotationSpeed.pitch - this.config.sensitivity, -this.config.maxRotationSpeed);
        }
        if (keys['ArrowDown']) {
            this.rotationSpeed.pitch = Math.min(this.rotationSpeed.pitch + this.config.sensitivity, this.config.maxRotationSpeed);
        }

        // --- 3. Roll Control (Left/Right) ---
        if (keys['ArrowLeft']) {
            this.rotationSpeed.roll = Math.max(this.rotationSpeed.roll - this.config.sensitivity, -this.config.maxRotationSpeed);
        }
        if (keys['ArrowRight']) {
            this.rotationSpeed.roll = Math.min(this.rotationSpeed.roll + this.config.sensitivity, this.config.maxRotationSpeed);
        }

        // --- 4. Physics & Smoothing ---
        this.rotationSpeed.pitch *= this.config.damping;
        this.rotationSpeed.roll *= this.config.damping;

        // Auto-leveling: Slowly return roll to 0 when no keys are pressed
        if (!keys['ArrowLeft'] && !keys['ArrowRight']) {
            this.model.rotation.z = THREE.MathUtils.lerp(this.model.rotation.z, 0, 0.05);
        }

        // --- 5. Applying Transformation ---
        // Rotate the plane
        this.model.rotateX(this.rotationSpeed.pitch);
        this.model.rotateZ(this.rotationSpeed.roll);

        // Yaw effect: Rolling automatically makes the plane turn slightly on Y axis
        this.model.rotateY(-this.rotationSpeed.roll * 0.7);

        // Constant forward movement
        this.model.translateZ(this.currentSpeed);
    }
}