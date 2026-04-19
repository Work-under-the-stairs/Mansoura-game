import * as THREE from 'three';
import { Cockpit } from './Cockpit';
import { Controls } from './Controls';

export class Engine {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private cockpit: Cockpit;
    private controls: Controls;

    constructor() {
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            10000
        );

        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        document.body.appendChild(this.renderer.domElement);

        this.controls = new Controls();
        this.cockpit = new Cockpit(this.scene, this.camera, this.controls);

        this.setupLights();
        this.createEnvironment();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    private setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        sunLight.position.set(50, 100, 50);
        sunLight.castShadow = true;
        this.scene.add(sunLight);
    }

    private createEnvironment() {
        const textureLoader = new THREE.TextureLoader();
        
        textureLoader.load('/images/sky.jpg', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.colorSpace = THREE.SRGBColorSpace;

            this.scene.background = texture;
            this.scene.environment = texture;
        }, undefined, (error) => {
            console.error("Error loading sky texture, falling back to solid color", error);
            this.scene.background = new THREE.Color(0x87ceeb);
        });
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

        if (this.cockpit) {
            this.cockpit.update();
        }

        this.renderer.render(this.scene, this.camera);
    }
}