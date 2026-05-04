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

    // ✅ نخزن الزوايا الفعلية ونعمل clamp عليها
    private angles = { pitch: 0, yaw: 0, roll: 0 };

    private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

    private config = {
        sensitivity:      0.0006,
        damping:          0.94,
        maxRotationSpeed: 0.04,
        minSpeed:         400,
        maxSpeed:         600,
        acceleration:     0.03,
        maxPitch:         Math.PI * 0.4,   // ✅ حد أقصى للـ pitch (~72 درجة)
        maxRoll:          Math.PI * 0.35,  // ✅ حد أقصى للـ roll (~63 درجة)
    };

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

        // loader.load('/models/cockpitfinal2.glb', (gltf) => {
        loader.load('/models/cockpitshit34.glb', (gltf) => {
            this.model = gltf.scene;
            this.scene.add(this.model);

            // this.model.position.set(450, 1450, 6200);

            // Attach camera

            this.model.add(this.camera);
            // this.camera.position.set(0, 0.165, -0.276);
            // this.camera.lookAt(0, 0, 0.276);
            this.camera.position.set(0, 0.24, -0.2);
            this.camera.lookAt(0, 0.34, 0.2);
            // this.camera.rotation.y = Math.PI;

            // // Interior lighting
            // const dashLight = new THREE.SpotLight(0xffffff, 0);
            // dashLight.position.set(0, 0.5, -0.5);
            // dashLight.angle    = Math.PI / 3;

            // dashLight.penumbra = 0.3;
            // dashLight.decay    = 1.5;
            // dashLight.distance = 5;

            // const lightTarget = new THREE.Object3D();
            // lightTarget.position.set(0, 0, 0.5);
            // this.model.add(dashLight);
            // this.model.add(lightTarget);
            // dashLight.target = lightTarget;

            // const ambientCabinLight = new THREE.PointLight(0x88ccff, 0.2, 0.5);
            // ambientCabinLight.position.set(0, 0.2, 0);
            // this.model.add(ambientCabinLight);

            // this.model.traverse((child) => {
            //     if ((child as THREE.Mesh).isMesh) {
            //         const mesh = child as THREE.Mesh;

            //         if (!this.isMobile) {
            //             mesh.castShadow = true;
            //             mesh.receiveShadow = true;
            //         }

            //         // mesh.castShadow    = true;
            //         // mesh.receiveShadow = true;
            //         if (mesh.material instanceof THREE.MeshStandardMaterial) {
            //             mesh.material.roughness = 0.6;
            //         }
            //     }
            // });
            // this.model.traverse((child) => {
            //     if ((child as THREE.Mesh).isMesh) {
            //         const mesh = child as THREE.Mesh;
                    
            //         if (mesh.material instanceof THREE.MeshStandardMaterial) {
            //             // لو الموديل فيه أجزاء المفروض تنور (شاشات/زراير)
            //             if (mesh.name.includes('screen') || mesh.name.includes('button')) {
            //                 mesh.material.emissive = new THREE.Color(0x00ffff); // لون النور
            //                 mesh.material.emissiveIntensity = 1.5;
            //             }
            //             mesh.material.roughness = 0.6;
            //         }
            //     }
            // });

            // ✅ Model is guaranteed loaded here — safe to create WeaponSystem
            this.weaponSystem = new WeaponSystem(
                this.scene,
                this.model,
                this.controls,
                this.projectileManager,
            );

            console.log('Cockpit Loaded & Flight Ready!');
        },
        (progress) => {
            console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
        },
        (error) => {
            console.error('Error loading cockpit:', error);
        });
    }


    // ✅ Returns cockpit's actual forward direction in world space (flat XZ)
    // public getWorldForward(): THREE.Vector3 {
    //     if (!this.model) return new THREE.Vector3(0, 0, -1);

    //     this.model.updateWorldMatrix(true, false);
    //     const forward = new THREE.Vector3();
    //     // Column 2 = local Z in world space, negate because Three.js -Z is forward
    //     forward.setFromMatrixColumn(this.model.matrixWorld, 2).negate();
    //     forward.y = 0;
    //     forward.normalize();
    //     return forward;
    // }

    // // ✅ Returns cockpit's actual world position
    // public getWorldPosition(): THREE.Vector3 {
    //     const pos = new THREE.Vector3();
    //     if (this.model) {
    //         this.model.getWorldPosition(pos);
    //     } else {
    //         pos.set(450, 1450, 6200); // fallback before model loads
    //     }
    //     return pos;
    // }

    private readonly _worldPos = new THREE.Vector3();

    public update(delta: number): void {
        if (!this.model) return;

        const keys = this.controls.keys;

        // Speed
        if (keys['ShiftLeft'] || keys['ShiftRight']) {
            this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.config.maxSpeed, this.config.acceleration);
        } else {
            this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.config.minSpeed, this.config.acceleration * 0.5);
        }

        // Rotation speed accumulation
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

        // Damping
        this.rotationSpeed.pitch *= this.config.damping;
        this.rotationSpeed.roll  *= this.config.damping;

        // ✅ تحديث الزوايا المخزنة مع clamp — هنا بيمنع التقلب
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

        // ✅ الـ yaw مربوط بالـ roll (طبيعي للطيران)
        this.angles.yaw += -this.rotationSpeed.roll * 0.7;

        // ✅ لما مفيش ضغط على يمين/شمال، الـ roll يرجع للصفر تدريجياً
        if (!keys['ArrowLeft'] && !keys['ArrowRight']) {
            this.angles.roll = THREE.MathUtils.lerp(this.angles.roll, 0, 0.05);
        }

        // ✅ نطبق الـ rotation من الـ angles المخزنة بـ order ثابت (YXZ)
        // YXZ = yaw أول → pitch → roll: أنسب order للطيران ويمنع Gimbal Lock
        // this.model.rotation.order = 'YXZ';
        // this.model.rotation.y = this.angles.yaw;
        // this.model.rotation.x = this.angles.pitch;
        // this.model.rotation.z = this.angles.roll;

        // // Movement
        // this.model.translateZ(this.currentSpeed * delta);

        // // Weapons
        // if (this.weaponSystem) {
        //     this.weaponSystem.setCockpitSpeed(this.currentSpeed);
        //     this.weaponSystem.update(delta);
        // }

        this.model.rotation.order = 'YXZ';
        this.model.rotation.y = this.angles.yaw;
        this.model.rotation.x = this.angles.pitch;
        this.model.rotation.z = this.angles.roll;

        // 3. الحركة: translateZ سريعة جداً و Optimized في Three.js
        this.model.translateZ(this.currentSpeed * delta);

        if (this.weaponSystem) {
            this.weaponSystem.setCockpitSpeed(this.currentSpeed);
            this.weaponSystem.update(delta);
        }
    }
}