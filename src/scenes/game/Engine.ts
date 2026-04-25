import * as THREE from 'three';
import { World } from './World';
import { Cockpit } from './Cockpit';
import { Controls } from './Controls';
import { MobileControls } from './MobileControls';
import { EnemyManager } from './EnemyManager';
import { LoadingScene } from '../LoadingScene';
import { ProjectileManager } from './ProjectileManager';

export class Engine {
  private loadingScene: LoadingScene;
  private loadingManager: THREE.LoadingManager;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cockpit: Cockpit;
  private controls: Controls;
  private world: World;
  private enemies: EnemyManager;

  private container: HTMLDivElement;
  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private mobileControls: MobileControls;
  private projectileManager: ProjectileManager;

  constructor(loadingScene: LoadingScene) {
    this.loadingScene   = loadingScene;
    this.loadingManager = new THREE.LoadingManager();
    this.loadingScene.attachToLoadingManager(this.loadingManager);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.1,
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
    this.container.style.zIndex = '5';
    this.container.style.background =
      'linear-gradient(180deg, #88bbed 0%, #d9ecff 55%, #ede2c9 100%)';
    document.body.appendChild(this.container);

    this.renderer = new THREE.WebGLRenderer({
      antialias:              true,
      powerPreference:        'high-performance',
      logarithmicDepthBuffer: true,
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.renderer.outputColorSpace    = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled   = true;
    this.renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.controls       = new Controls();
    this.mobileControls = new MobileControls(this.container, this.controls);

    this.world = new World(
      this.scene,
      this.loadingManager,
      {
        skyExrUrl:       '/images/qwantani_afternoon_2k.exr',
        terrainSize:     42000,
        terrainSegments: 420,
        riverWidth:      420,
        cloudCount:      10,
      },
      this.renderer,
    );

    // ProjectileManager needs only the scene — ready immediately
    this.projectileManager = new ProjectileManager(this.scene);

    // Cockpit receives projectileManager and creates WeaponSystem
    // internally after the GLB finishes loading
    this.cockpit = new Cockpit(
      this.scene,
      this.camera,
      this.controls,
      this.loadingManager,
      this.projectileManager,
    );
    // 👾 Enemies — receives cockpit reference for accurate world position & forward
    this.enemies = new EnemyManager(this.scene, this.camera, this.cockpit);

    this.setupLights();
    this.createEnvironment();

    window.addEventListener('resize', this.onWindowResize);

    // 👇 Hide everything immediately — assets load silently in background
    this.hide();
  }

  // =====================
  //  Visibility controls
  // =====================

  public hide(): void {
    this.container.style.visibility = 'hidden';
    this.container.style.pointerEvents = 'none';

    // Also hide mobile controls if they were injected
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';
  }

  public show(): void {
    this.container.style.visibility = 'visible';
    this.container.style.pointerEvents = 'auto';

    // Restore mobile controls
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = '';
  }

  // =====================
  //  Lights & environment
  // =====================

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff3d0, 3.5);
    sunLight.position.set(-9000, 8500, -5000);
    sunLight.castShadow = true;

    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left   = -20000;
    sunLight.shadow.camera.right  =  20000;
    sunLight.shadow.camera.top    =  20000;
    sunLight.shadow.camera.bottom = -20000;
    sunLight.shadow.camera.far    =  50000;

    this.scene.add(sunLight);

    const hemi = new THREE.HemisphereLight(0xe7f3ff, 0x97886a, 1.0);
    this.scene.add(hemi);
  }

  private createEnvironment(): void {
    this.scene.fog = new THREE.Fog(0xcad9e6, 9000, 52000);
  }

  // =====================
  //  Lifecycle
  // =====================

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


    if (this.cockpit) this.cockpit.update(delta);
    if (this.world)   this.world.update(delta);
    if (this.enemies) this.enemies.update(delta);
    this.projectileManager.update(delta);

    this.renderer.render(this.scene, this.camera);
  };

  public destroy(): void {
    window.cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onWindowResize);

    if (this.world)                       this.world.dispose();
    if (this.mobileControls)              this.mobileControls.destroy();
    if (this.cockpit.weaponSystem)        this.cockpit.weaponSystem.dispose();
    if (this.projectileManager)           this.projectileManager.dispose();

    this.renderer.dispose();
    this.container.remove();

    console.log('Engine Destroyed safely.');
  }

  public onReady(callback: () => void): void {
    this.loadingScene.onComplete(callback);
  }
}