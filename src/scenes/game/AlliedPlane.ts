import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Cockpit } from './Cockpit';

const ALLY_SPEED     = 5000;   // سرعة الطيارة الحليفة
const ALLY_LIFETIME  = 12;    // ثواني قبل ما تختفي
const ALLY_BASE_SCALE = 120;

export class AlliedPlaneManager {
  private scene:   THREE.Scene;
  private cockpit: Cockpit;
  private model:   THREE.Object3D | null = null;
  private modelReady = false;
  private allies:  { mesh: THREE.Object3D; velocity: THREE.Vector3; age: number }[] = [];

  constructor(scene: THREE.Scene, cockpit: Cockpit) {
    this.scene   = scene;
    this.cockpit = cockpit;
    this.loadModel();
  }

  private loadModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/models/enemy2.glb',   // نفس موديل العدو — بس هنلونه أخضر
      (gltf) => {
        this.model = gltf.scene;

        // لون أخضر/رمادي يميزه عن العدو
        this.model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m: any) => {
            //   if (m.color) m.color.set(0x4a8c4a); // أخضر عسكري
            });
          }
        });

        this.model.scale.setScalar(ALLY_BASE_SCALE);
        this.modelReady = true;
      },
      undefined,
      (err) => console.error('❌ Allied plane load error:', err),
    );
  }

  /**
   * يطلق count طيارات حليفة من فوق الكوكبت
   * إذا count=2 يبعتهم بفارق زمني بسيط ويمين/يسار
   */
  public launch(count: 1 | 2): void {
    if (!this.modelReady || !this.model || !this.cockpit.model) return;

    if (count === 1) {
      this._spawnAlly(0, 0);
    } else {
      this._spawnAlly(-2000, 0);
      setTimeout(() => this._spawnAlly(2000, 0), 600); // تأخير بسيط بينهم
    }
  }

  private _spawnAlly(offsetX: number, offsetY: number): void {
    if (!this.model || !this.cockpit.model) return;

    const cockpitPos = new THREE.Vector3();
    this.cockpit.model.getWorldPosition(cockpitPos);

    // ابدأ من فوق الكوكبت بشوية
    const spawnPos = cockpitPos.clone();
    spawnPos.y += 1500;

    const forward = new THREE.Vector3();
    const right   = new THREE.Vector3();
    this.cockpit.model.updateWorldMatrix(true, false);
    forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
    right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();

    spawnPos.addScaledVector(right, offsetX);
    spawnPos.addScaledVector(forward, 2000); // شوية قدام الكوكبت

    const ally = this.model.clone(true);
    ally.position.copy(spawnPos);

    // توجيه للأمام (نفس اتجاه الكوكبت)
    const targetPos = spawnPos.clone().addScaledVector(forward, 10000);
    ally.lookAt(targetPos);
    ally.rotateY(-Math.PI / 2); // تصحيح محور GLB

    // سرعة للأمام
    const velocity = forward.clone().multiplyScalar(ALLY_SPEED);

    this.scene.add(ally);
    this.allies.push({ mesh: ally, velocity, age: 0 });
  }

  public update(delta: number): void {
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const ally = this.allies[i];
      ally.age += delta;

      // حرك للأمام
      ally.mesh.position.addScaledVector(ally.velocity, delta);

      // بعد ALLY_LIFETIME ثانية، إزله
      if (ally.age >= ALLY_LIFETIME) {
        this.scene.remove(ally.mesh);
        this.allies.splice(i, 1);
      }
    }
  }

  public clearAll(): void {
    for (const a of this.allies) this.scene.remove(a.mesh);
    this.allies = [];
  }
}