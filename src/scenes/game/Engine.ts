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
import { applyMobileOptimizations } from '../../utils/MobileOptimizer';
import { MissionController } from './MissionController';
import { MissionController2 } from './MissionController2';
import { TransitionPlane } from './TransitionPlane';

// ✅ النظام الجديد — بديل EXR كاملاً
import { ProceduralSky, InfiniteTerrain, setupFog, setupLighting } from './Egyptterrain';

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
  public combatSystem: CombatSystem;
  private notifications: NotificationSystem;

  private container: HTMLDivElement;
  private clock = new THREE.Timer();
  private animationFrameId = 0;
  private mobileControls: MobileControls;
  private projectileManager: ProjectileManager;
  private readonly isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

  private onRestartCallback: (() => void) | null = null;
  private onExitCallback: (() => void) | null = null;
  private readyCallback: (() => void) | null = null;
  private animationStarted = false;
  private levelStarted = 0;

  private missionController: MissionController | null = null;
  private missionController2: MissionController2 | null = null;
  public transitionPlane: TransitionPlane | null = null;

  // ✅ مراجع النظام الجديد
  private sky: ProceduralSky | null = null;
  private terrain: InfiniteTerrain | null = null;

  constructor(loadingScene: LoadingScene) {
    this.loadingScene   = loadingScene;
    this.loadingManager = new THREE.LoadingManager();

    this.loadingScene.attachToLoadingManager(this.loadingManager);
    this.loadingScene.updateProgress(1);

    this.loadingScene.onComplete(() => {
      console.log('[Engine] Assets ready — firing readyCallback');
      if (this.readyCallback) {
        this.readyCallback();
        this.readyCallback = null;
      }
    });

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.1,
      // ✅ زودنا الـ far plane — السماء قطرها 450000
      500000,
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
    // ✅ لون الـ background يطابق لون ضباب EgyptTerrain1973 (بيج رملي)
    // لو السماء البروسيديورال شغالة مش هتشوف ده أبداً، بس لازم يتطابق
    this.container.style.background = '#C8B89A';
    document.body.appendChild(this.container);

    this.renderer = new THREE.WebGLRenderer({
      antialias:              !this.isMobile,
      powerPreference:        'high-performance',
      logarithmicDepthBuffer: !this.isMobile,
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    // ✅ رفعنا الـ exposure — يخلي الكل أكثر إضاءة بدون تكلفة على الأداء
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace    = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled   = !this.isMobile;
    this.renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.notifications = new NotificationSystem();

    this.controls       = new Controls();
    this.mobileControls = new MobileControls(this.container, this.controls);

    this.world = new World(
      this.scene,
      this.loadingManager,
      {
        // ✅ حذفنا skyExrUrl خالص — مفيش EXR
        terrainSize:     42000,
        terrainSegments: this.isMobile ? 100 : 420,
        riverWidth:      420,
        cloudCount:      this.isMobile ? 3 : 10,
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

    // Companion plane — model loads async via loadingManager
    this.transitionPlane = new TransitionPlane(this.scene, this.loadingManager, this.cockpit);

    this.combatSystem = new CombatSystem(
      this.scene,
      this.camera,
      this.cockpit,
      this.enemies,
      this.projectileManager,
      this.notifications,
      () => {
        console.log("Engine: Restart triggered");
      },
      () => {
        console.log("Engine: Exit triggered");
        this.destroy();
      }
    );

    // ✅ الإضاءة والبيئة الجديدة
    this.setupLights();
    this.createEnvironment();

    // ✅ السماء والتضاريس — بعد setupLights عشان الضوء يكون جاهز
    this.sky     = new ProceduralSky(this.scene);
    this.terrain = new InfiniteTerrain(this.scene);

    // ✅ ٢ ظهر بالضبط (0.5 = ظهر، 0.58 = ٢ ظهر تقريباً)
    this.sky.setTimeOfDay(0.58);

    // ✅ خفّضنا الـ HemisphereLight — setupLighting بيضيف ambient + fill كافيين
    //    لو خلّيناه بنفس القيمة بيتضاعف الضوء ويبقى overexposed
    const hemi = new THREE.HemisphereLight(0xC8E0FF, 0xA89060, 0.5);
    hemi.matrixAutoUpdate = false;
    hemi.updateMatrix();
    this.scene.add(hemi);

    window.addEventListener('resize', this.onWindowResize);

    this.hide();

    this.missionController  = new MissionController(this);
    this.missionController2 = new MissionController2(this);
    (window as any).missionController = this.missionController;
    (window as any).missionController2 = this.missionController2;

    // Wire level-1 victory → level-2 start
    this.missionController.onVictory = () => {
      if (this.levelStarted !== 1) return;
      console.log('[Engine] Level 1 complete → Level 2 starting');
      this.enemies.clearAll();
      const projs = (this.projectileManager as any).projectiles as Array<{mesh: any, alive: boolean}> | undefined;
      if (projs) {
        for (const p of projs) { this.scene.remove(p.mesh); p.alive = false; }
        (this.projectileManager as any).projectiles = [];
      }
      console.log('[Engine] Level 1 victory detected. Starting Level 2 sequence.');
      this.levelStarted = 2;
      if (this.missionController2) {
        this.missionController2.reset();
        this.missionController2.start();
      }
    };
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

    if ((window as any).miniMap) {
      (window as any).miniMap.hideArrow();
    }

    if (this.combatSystem) {
      this.combatSystem.hideHUD();
    }
  }

  public show(): void {
    this.container.style.visibility = 'visible';
    this.container.style.pointerEvents = 'auto';

    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls) mobileControls.style.display = '';

    if ((window as any).miniMap) {
      (window as any).miniMap.showArrow();
    }
    if (this.combatSystem) {
      this.combatSystem.showHUD();
    }
  }

  // =====================
  //  Full game reset (Replay without destroying Engine)
  // =====================

  public resetForReplay(): void {
    console.log('[Engine] Resetting for replay...');

    // 1. Cancel pending mission timers, clear decision cards, reset state machines
    if (this.missionController)  this.missionController.reset();
    if (this.missionController2) this.missionController2.reset();

    // 2. Clear all active enemies and reset spawn index
    if (this.enemies) this.enemies.clearAll();

    if (this.projectileManager) {
      (this.projectileManager as any).clearAll?.();
      const projs = (this.projectileManager as any).projectiles as Array<{mesh: any, alive: boolean}> | undefined;
      if (projs) {
        for (const p of projs) { this.scene.remove(p.mesh); p.alive = false; }
        (this.projectileManager as any).projectiles = [];
      }
    }

    // 4. Reset health + combat system (hides death screen, resets HP bar to 100)
    if (this.combatSystem) this.combatSystem.reset();

    if (this.cockpit?.model) {
      this.cockpit.model.position.set(450, 1450, 6200);
      this.cockpit.model.rotation.set(0, 0, 0);
      (this.cockpit as any).angles = { pitch: 0, yaw: 0, roll: 0 };
      (this.cockpit as any).rotationSpeed = { pitch: 0, roll: 0 };
      (this.cockpit as any).currentSpeed = (this.cockpit as any).config.minSpeed;
    }

    // 6. Snap companion plane back to cockpit
    this.transitionPlane?.snapToCockpit();

    // 7. Restart mission — levelStarted=0 lets animate() call start() next frame
    this.levelStarted = 0;
    console.log('[Engine] Reset complete — mission restarting.');
  }

  // =====================
  //  Lights & environment
  // =====================

  private setupLights(): void {
    // ✅ استخدمنا setupLighting من EgyptTerrain1973
    // بترجع sun و ambient لو محتجتيهم بعدين
    setupLighting(this.scene);

    // ✅ HemisphereLight ثابت زي الأصل
    const hemi = new THREE.HemisphereLight(0xe7f3ff, 0x97886a, 1.0);
    hemi.matrixAutoUpdate = false;
    hemi.updateMatrix();
    this.scene.add(hemi);
  }

  private createEnvironment(): void {
    // ✅ setupFog من EgyptTerrain1973 — بيخفي الـ horizon seam
    setupFog(this.scene);
  }

  // =====================
  //  Lifecycle
  // =====================

  public init(options?: { onRestart?: () => void; onExit?: () => void }): void {
    if (this.combatSystem && options) {
      const hs = (this.combatSystem as any).health;

      // On Replay: reset in-place ONLY — never call options.onRestart because
      // that creates a new Engine in main.ts which crashes (loadingScene is gone)
      hs.onRestartCallback = () => {
        this.resetForReplay();
      };

      hs.onExitCallback = () => {
        this.destroy();
        options.onExit?.();
      };

      if (this.animationStarted) {
        console.warn('[Engine] init() called more than once — ignoring');
        return;
      }
      this.animationStarted = true;
      this.animate();
    }
  }

  private onWindowResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private mobileOptimized = false;

  private animate = (): void => {
    this.animationFrameId = window.requestAnimationFrame(this.animate);

    this.clock.update();
    const delta = this.clock.getDelta();

    if (this.cockpit)         this.cockpit.update(delta);
    if (this.transitionPlane) this.transitionPlane?.update();
    if (this.world)           this.world.update(delta, this.cockpit.model?.position, (this.cockpit as any).angles?.yaw ?? 0);
    if (this.enemies)         this.enemies.update(delta);
    this.projectileManager.update(delta);
    this.combatSystem.update(delta);

    // ✅ تحديث السماء والتضاريس كل frame
    if (this.sky)     this.sky.update(this.camera, delta);
    if (this.terrain && this.cockpit.model) {
      this.terrain.update(this.cockpit.model.position);
    }

    this.renderer.render(this.scene, this.camera);

    if (!this.mobileOptimized && this.cockpit.model) {
      this.optimizeForMobile();
      this.mobileOptimized = true;
    }

    // levelStarted=0 → start level 1
    // levelStarted=1 → level 1 running (victory fires via missionController.onVictory)
    // levelStarted=2 → level 2 running
    if (!this.levelStarted && this.cockpit.model) {
      if (this.missionController) {
        this.missionController.start();
        this.levelStarted = 1;
      }
    }
    // if (this.levelStarted === 1 && this.missionController?.getMissionState()) {
    //   console.log("Mission state indicates victory, starting next level...");
    //   this.levelStarted = 2;
    // }

  };

  public destroy(): void {
    window.cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onWindowResize);

    if (this.missionController)  { this.missionController.reset();  this.missionController  = null; }
    if (this.missionController2) { this.missionController2.reset(); this.missionController2 = null; }

    if (this.transitionPlane)      { this.transitionPlane.dispose(); this.transitionPlane = null; }
    if (this.world)                this.world.dispose();
    if (this.mobileControls)       this.mobileControls.destroy();
    if (this.cockpit.weaponSystem) this.cockpit.weaponSystem.dispose();
    if (this.projectileManager)    this.projectileManager.dispose();
    if (this.combatSystem)         this.combatSystem.dispose();
    if (this.notifications)        this.notifications.destroy();

    // ✅ تنظيف السماء والتضاريس
    if (this.sky) {
      (this.sky as any).mesh && this.scene.remove((this.sky as any).mesh);
      this.sky = null;
    }
    if (this.terrain) {
      (this.terrain as any).chunks?.forEach((chunk: any) => {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
      });
      this.terrain = null;
    }

    this.renderer.dispose();
    this.container.remove();

    console.log('Engine destroyed safely.');
  }

  public onReady(callback: () => void): void {
    this.readyCallback = callback;
  }

  // ✅ لو محتاجة تعرفي الطيارة فوق الأرض ولا لأ
  public getGroundHeight(x: number, z: number): number {
    return this.terrain?.getHeightAt(x, z) ?? 0;
  }

  private optimizeForMobile(): void {
    if (!this.isMobile) return;

    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (!m.isMeshStandardMaterial) continue;

        if (m.normalMap) { m.normalMap.dispose();  m.normalMap = null; }
        if (m.aoMap)     { m.aoMap.dispose();       m.aoMap     = null; }
        m.needsUpdate = true;
      }
    });
  }
}