import * as THREE from 'three';
import { Cockpit } from './Cockpit';

export class Engine {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private cockpit: Cockpit;

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); 

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            10000
        );

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        document.body.appendChild(this.renderer.domElement);

        this.addTemporaryLights();

        this.cockpit = new Cockpit(this.scene, this.camera);

        window.addEventListener('resize', () => this.onWindowResize());
    }

private addTemporaryLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 4); 
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 6); 
    sunLight.position.set(30, 40, 20); 
    
    sunLight.castShadow = true;
    this.scene.add(sunLight);
}

    public init() {
        console.log("Engine Initialized");
        this.animate();
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private animate() {
        requestAnimationFrame(() => this.animate());

        this.cockpit.update();

        this.renderer.render(this.scene, this.camera);
    }
}