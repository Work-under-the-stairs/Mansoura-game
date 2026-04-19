import * as THREE from 'three';
// import { World } from './World';
// import { Cockpit } from './Cockpit';
// import { Controls } from './Controls';

export class Engine {
    // private scene: THREE.Scene;
    // private camera: THREE.PerspectiveCamera;
    // private renderer: THREE.WebGLRenderer;
    
    // private world: World;
    // private cockpit: Cockpit;
    // private controls: Controls;

    // constructor() {
    //     // 1. إنشاء المشهد
    //     this.scene = new THREE.Scene();
        
    //     // 2. إعداد الكاميرا
    //     this.camera = new THREE.PerspectiveCamera(
    //         75, 
    //         window.innerWidth / window.innerHeight, 
    //         0.1, 
    //         10000
    //     );

    //     // 3. إعداد الـ Renderer
    //     this.renderer = new THREE.WebGLRenderer({ antialias: true });
    //     this.renderer.setSize(window.innerWidth, window.innerHeight);
    //     this.renderer.setPixelRatio(window.devicePixelRatio);
    //     document.body.appendChild(this.renderer.domElement);

    //     // 4. استدعاء المكونات التانية
    //     this.world = new World(this.scene);
    //     this.cockpit = new Cockpit(this.scene, this.camera);
    //     this.controls = new Controls(this.cockpit);
    // }

    // public init() {
    //     this.animate();
        
    //     // تعامل مع تغيير حجم الشاشة
    //     window.addEventListener('resize', () => this.onWindowResize());
    // }

    // private onWindowResize() {
    //     this.camera.aspect = window.innerWidth / window.innerHeight;
    //     this.camera.updateProjectionMatrix();
    //     this.renderer.setSize(window.innerWidth, window.innerHeight);
    // }

    // private animate() {
    //     requestAnimationFrame(() => this.animate());

    //     // تحديث المنطق (Logic)
    //     this.cockpit.update();
    //     // this.enemyManager.update(); // لما تجهزيه

    //     // الرندر النهائي
    //     this.renderer.render(this.scene, this.camera);
    // }
}