import * as THREE from 'three';
import { World } from './World';
import { Cockpit } from './Cockpit';
import { Controls } from './Controls';
import { MobileControls } from './MobileControls';

export class Engine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cockpit: Cockpit;
  private controls: Controls;
  private world: World;
  private container: HTMLDivElement;
  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private mobileControls: MobileControls;

  constructor() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.001,
      80000,
    );
    this.camera.position.set(450, 1450, 6200);
    this.camera.lookAt(900, 240, -12000);

    const existing = document.getElementById('game-world-root');
    if (existing) existing.remove();

    this.container = document.createElement('div');
    this.container.id = 'game-world-root';
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.background = 'linear-gradient(180deg, #88bbed 0%, #d9ecff 55%, #ede2c9 100%)';
    this.container.style.zIndex = '5';
    document.body.appendChild(this.container);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new Controls();
    this.world = new World(this.scene, {
      terrainSize: 42000,
      terrainSegments: 420,
      riverWidth: 420,
      cloudCount: 10,
    });
    this.cockpit = new Cockpit(this.scene, this.camera, this.controls);

    this.mobileControls = new MobileControls(this.container, this.controls);

    this.setupLights();
    this.createEnvironment();
    window.addEventListener('resize', this.onWindowResize);
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff3d0, 4);
    sunLight.position.set(-9000, 8500, -5000);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    this.scene.add(sunLight);

    const hemi = new THREE.HemisphereLight(0xe7f3ff, 0x97886a, 1.25);
    this.scene.add(hemi);
  }

  private createEnvironment(): void {
    this.scene.background = new THREE.Color(0xa9cff5);
    this.scene.fog = new THREE.Fog(0xcad9e6, 9000, 52000);
  }

  public init(): void {
    this.animate();
  }

  private onWindowResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private animate = (): void => {
    this.animationFrameId = window.requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    if (this.cockpit) {
      this.cockpit.update();
    }

    if (this.world) {
      this.world.update(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  public destroy(): void {
    window.cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onWindowResize);

    if (this.world) {
      this.world.dispose();
    }

    this.renderer.dispose();
    this.container.remove();
    this.mobileControls.destroy();
  }
}
