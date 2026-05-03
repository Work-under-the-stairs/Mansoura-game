import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { MiniMap } from './MiniMap';

export interface WorldOptions {
  skyExrUrl?: string;
  mapImageUrl?: string;
}

export class World {
  public readonly root = new THREE.Group();
  private readonly scene: THREE.Scene;
  private readonly options: WorldOptions;
  private time = 0;

  // ✅ أُزيلت الإضاءة المكررة من هنا — Engine.setupLights() بتعملها
  private renderer: THREE.WebGLRenderer | null = null;
  private loadingManager: THREE.LoadingManager;

  private miniMap?: MiniMap;

  // Whether we've already captured the spawn heading
  private headingReferenceSet = false;

  // Reusable objects — avoids per-frame allocation
  private readonly _quat   = new THREE.Quaternion();
  private readonly _euler  = new THREE.Euler();
  private headingWarnShown = false;

  constructor(
    scene: THREE.Scene,
    loadingManager: THREE.LoadingManager,
    options: Partial<WorldOptions> = {},
    renderer?: THREE.WebGLRenderer
  ) {
    this.scene         = scene;
    this.loadingManager = loadingManager;
    this.options       = options;
    this.renderer      = renderer ?? null;

    this.build();
    this.loadSkyEXR();

    const mapUrl = this.options.mapImageUrl || '/images/egypt-map.png';

    this.miniMap = new MiniMap({
      mapImageUrl: mapUrl,
      width:  200,
      height: 200
    });
    
    // DEBUG: Attach world to window
    (window as any).gameWorld = this;
  }

  private loadSkyEXR(): void {
    const url = this.options.skyExrUrl;
    if (!url || !this.renderer) return;

    const loader = new EXRLoader(this.loadingManager);
    loader.setDataType(THREE.FloatType);

    loader.load(url, (texture) => {
      try {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(this.renderer!);
        pmrem.compileEquirectangularShader();
        const envMap = pmrem.fromEquirectangular(texture).texture;
        this.scene.environment = envMap;
        this.scene.background  = envMap;
        texture.dispose();
        pmrem.dispose();
      } catch (e) {
        console.warn('[World] Failed to apply EXR:', e);
        this.scene.background = new THREE.Color(0x8ec5f7);
      }
    });
  }

  private build(): void {
    this.scene.add(this.root);
    // ✅ createEnvironment() أُزيلت — الإضاءة موجودة في Engine.setupLights()
  }

  // ✅ createEnvironment() أُزيلت بالكامل عشان مكانش فيها غير إضاءة مكررة

  /**
   * Call each frame.
   *
   * @param deltaTime      Seconds since last frame.
   * @param playerPosition World-space position of the cockpit.
   * @param cockpitObject  The cockpit THREE.Object3D whose orientation defines
   *                       the heading.
   */
  // public update(
  //   deltaTime: number,
  //   playerPosition?: THREE.Vector3,
  //   cockpitObject?: THREE.Object3D
  // ): void {
  //   this.time += deltaTime;

  //   if (!this.miniMap) return;

  //   // ── Position ────────────────────────────────────────────────────────────
  //   if (playerPosition) {
  //     this.miniMap.updatePlayerPosition(playerPosition.x, playerPosition.z);
  //   }

  //   // ── Heading ─────────────────────────────────────────────────────────────
  //   if (cockpitObject) {
  //     cockpitObject.updateMatrixWorld(true);
  //     cockpitObject.getWorldQuaternion(this._quat);
  //     this._euler.setFromQuaternion(this._quat, 'YXZ');
  //     const headingRad = this._euler.y;
  //     this.miniMap.updateHeading(headingRad);
  //   } else {
  //     // cockpitObject was NOT passed — arrow will never move!
  //     // Check your main loop: world.update(delta, position, cockpit.model)
  //     console.warn('[World] cockpitObject is missing from world.update() call!');
  //   }
  // }
  // public update(deltaTime: number, playerPosition?: THREE.Vector3, cockpitObject?: THREE.Object3D): void {
  //   this.time += deltaTime;
  //   if (!this.miniMap) return;

  //   if (playerPosition) {
  //     this.miniMap.updatePlayerPosition(playerPosition.x, playerPosition.z);
  //   }

  //   if (cockpitObject) {
  //     // cockpitObject.updateMatrixWorld(true);
  //     cockpitObject.getWorldQuaternion(this._quat);
  //     this._euler.setFromQuaternion(this._quat, 'YXZ');
  //     this.miniMap.updateHeading(this._euler.y);
  //   } else if (!this.headingWarnShown) {
  //     console.warn('[World] cockpitObject is missing!');
  //     this.headingWarnShown = true; // ← مرة واحدة بس
  //   }
  // }
  // تعديل توقيع الدالة لتستقبل الـ yaw مباشرة
public update(deltaTime: number, playerPosition?: THREE.Vector3, playerYaw?: number): void {
    this.time += deltaTime;
    if (!this.miniMap) return;

    if (playerPosition) {
        this.miniMap.updatePlayerPosition(playerPosition.x, playerPosition.z);
    }

    // بدل الحسابات المعقدة، بنستخدم القيمة الجاهزة
    if (playerYaw !== undefined) {
        this.miniMap.updateHeading(playerYaw);
    }
}

  public resetHeadingReference(): void {
    this.headingReferenceSet = false;
  }

  public dispose(): void {
    this.scene.remove(this.root);
    this.scene.background  = null;
    this.scene.environment = null;
    if (this.miniMap) {
      this.miniMap.dispose();
    }
  }
}