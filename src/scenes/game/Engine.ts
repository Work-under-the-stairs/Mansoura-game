import * as THREE from 'three';
import { World } from './World';
import { Cockpit } from './Cockpit';
import { Controls } from './Controls';
import { MobileControls } from './MobileControls';
import { EnemyManager } from './EnemyManager';
import { LoadingScene } from '../LoadingScene';
import { ProjectileManager } from './ProjectileManager';
import { CombatSystem } from './CombatSystem';
import { NotificationSystem } from './NotificationSystem';


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
  private combatSystem: CombatSystem;
  private notifications: NotificationSystem;

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
    this.camera.position.set(450, 5450, 6200);
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

    // ── Notification system — mounted on document.body ──
    // Must be constructed BEFORE CombatSystem so it can be passed in
    this.notifications = new NotificationSystem();

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

    this.projectileManager = new ProjectileManager(this.scene);

    this.cockpit = new Cockpit(
      this.scene,
      this.camera,
      this.controls,
      this.loadingManager,
      this.projectileManager,
    );

    this.enemies = new EnemyManager(this.scene, this.camera, this.cockpit);

    this.combatSystem = new CombatSystem(
      this.scene,
      this.camera,
      this.cockpit,
      this.enemies,
      this.projectileManager,
      this.notifications,       // ← wired in here
    );

    this.setupLights();
    this.createEnvironment();
    window.addEventListener('resize', this.onWindowResize);

    this.hide();
  }

  // =====================
  //  Notification API
  // =====================

  public get notif(): NotificationSystem {
    return this.notifications;
  }

  // =====================
  //  Visibility controls
  // =====================

  public hide(): void {
    this.container.style.visibility = 'hidden';
    this.container.style.pointerEvents = 'none';

    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = 'none';

    // Hide MiniMap arrow when cockpit is hidden
    if ((window as any).miniMap) {
      (window as any).miniMap.hideArrow();
    }
  }

  public show(): void {
    this.container.style.visibility = 'visible';
    this.container.style.pointerEvents = 'auto';

    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = '';

    // Show MiniMap arrow when cockpit is shown
    if ((window as any).miniMap) {
      (window as any).miniMap.showArrow();
    }
    if (this.combatSystem){
      this.combatSystem.showHUD();
    }
    // this.enterFullscreen();
  }

  // private enterFullscreen(): void {
  //   const el = document.documentElement;
  //   if (el.requestFullscreen) {
  //     el.requestFullscreen();
  //   } else if ((el as any).webkitRequestFullscreen) {
  //     (el as any).webkitRequestFullscreen(); // Safari/iOS
  //   }
  // }

  // =====================
  //  Lights & environment
  // =====================

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff3d0, 4);
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
    if (this.world)   this.world.update(delta, this.cockpit.model?.position, this.cockpit.model ?? undefined);
    if (this.enemies) this.enemies.update(delta);
    this.projectileManager.update(delta);
    this.combatSystem.update(delta);

    this.renderer.render(this.scene, this.camera);
  };

  public destroy(): void {
    window.cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onWindowResize);

    if (this.world)                this.world.dispose();
    if (this.mobileControls)       this.mobileControls.destroy();
    if (this.cockpit.weaponSystem) this.cockpit.weaponSystem.dispose();
    if (this.projectileManager)    this.projectileManager.dispose();
    if (this.combatSystem)         this.combatSystem.dispose();
    if (this.notifications)        this.notifications.destroy();

    this.renderer.dispose();
    this.container.remove();

    console.log('Engine destroyed safely.');
  }

  public onReady(callback: () => void): void {
    this.loadingScene.onComplete(callback);
  }
}
