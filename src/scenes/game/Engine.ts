import * as THREE from 'three';
import { World } from './World';

export class Engine {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private world!: World;
  private container!: HTMLDivElement;
  private clock = new THREE.Clock();
  private animationFrameId = 0;

  public init(): void {
    this.createContainer();
    this.createScene();
    this.createRenderer();
    this.createCamera();
    this.createWorld();
    this.animate();
    window.addEventListener('resize', this.onResize);
  }

  private createContainer(): void {
    const existing = document.getElementById('game-world-root');
    if (existing) existing.remove();

    this.container = document.createElement('div');
    this.container.id = 'game-world-root';
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.background = 'linear-gradient(180deg, #9fd3ff 0%, #d9ecff 45%, #f3efe1 100%)';
    this.container.style.zIndex = '5';
    document.body.appendChild(this.container);
  }

  private createScene(): void {
    this.scene = new THREE.Scene();
  }

  private createRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
  }

  private createCamera(): void {
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 50000);
    this.camera.position.set(0, 900, 1700);
    this.camera.lookAt(0, 0, -3200);
  }

  private createWorld(): void {
    this.world = new World(this.scene, {
      terrainSize: 26000,
      terrainSegments: 280,
      riverWidth: 360,
      cloudCount: 16,
    });
  }

  private animate = (): void => {
    this.animationFrameId = window.requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    this.camera.position.x = Math.sin(elapsed * 0.08) * 220;
    this.camera.position.y = 900 + Math.sin(elapsed * 0.12) * 30;
    this.camera.position.z = 1700 - elapsed * 55;
    this.camera.lookAt(0, 80, this.camera.position.z - 3800);

    this.world.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  public destroy(): void {
    window.cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onResize);
    this.world.dispose();
    this.renderer.dispose();
    this.container.remove();
  }
}
