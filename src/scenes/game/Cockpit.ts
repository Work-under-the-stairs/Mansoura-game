import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class Cockpit {
    public model: THREE.Group | null = null;

    constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
        this.loadModel();
    }

    private loadModel() {
        const loader = new GLTFLoader();
        
        // دلوقت بنحمل ملف واحد فقط فيه كل حاجة
        loader.load('/models/cockpit.glb', (gltf) => {
            this.model = gltf.scene;
            this.scene.add(this.model);
            this.model.add(this.camera);

            this.camera.position.set(0, 0.25, -0.1);
            this.camera.lookAt(0, 0.55, 1);

            console.log('Cockpit Loaded (GLB Version)!');
        }, 
        (progress) => {
            console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
        },
        (error) => {
            console.error('Error loading cockpit:', error);
        });
    }

    update() {
        if (this.model) {
            
        }
    }
}