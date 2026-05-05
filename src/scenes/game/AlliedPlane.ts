import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Cockpit } from './Cockpit';

const ALLY_SPEED      = 5000;
const ALLY_LIFETIME   = 12;
const ALLY_BASE_SCALE = 120;

export class AlliedPlaneManager {
  private scene:   THREE.Scene;
  private cockpit: Cockpit;
  private model:   THREE.Object3D | null = null;
  private modelReady = false;
  private allies:  { mesh: THREE.Object3D; velocity: THREE.Vector3; age: number }[] = [];

  // FIX: Track the delayed second-spawn so clearAll() can cancel it before it fires
  private pendingSpawn: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: THREE.Scene, cockpit: Cockpit) {
    this.scene   = scene;
    this.cockpit = cockpit;
    this.loadModel();
  }

  private loadModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/models/enemy2.glb',
      (gltf) => {
        this.model = gltf.scene;

        this.model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((_m: any) => {
              // Optional: tint green to distinguish from enemy
              // if (m.color) m.color.set(0x4a8c4a);
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
   * Launch 1 or 2 allied planes from above the cockpit.
   * For count=2 the second plane is offset and delayed by 600ms.
   */
  public launch(count: 1 | 2): void {
    if (!this.modelReady || !this.model || !this.cockpit.model) return;

    if (count === 1) {
      this._spawnAlly(0, 0);
    } else {
      this._spawnAlly(-2000, 0);

      // FIX: Store the timeout ID so clearAll() can cancel it if called within 600ms
      this.pendingSpawn = setTimeout(() => {
        this.pendingSpawn = null;
        this._spawnAlly(2000, 0);
      }, 600);
    }
  }

  private _spawnAlly(offsetX: number, offsetY: number): void {
    if (!this.model || !this.cockpit.model) return;

    const cockpitPos = new THREE.Vector3();
    this.cockpit.model.getWorldPosition(cockpitPos);

    const spawnPos = cockpitPos.clone();
    spawnPos.y += 1500;

    const forward = new THREE.Vector3();
    const right   = new THREE.Vector3();
    this.cockpit.model.updateWorldMatrix(true, false);
    forward.setFromMatrixColumn(this.cockpit.model.matrixWorld, 2).normalize();
    right.setFromMatrixColumn(this.cockpit.model.matrixWorld, 0).normalize();

    spawnPos.addScaledVector(right, offsetX);
    spawnPos.addScaledVector(forward, 2000);

    const ally = this.model.clone(true);
    ally.position.copy(spawnPos);

    const targetPos = spawnPos.clone().addScaledVector(forward, 10000);
    ally.lookAt(targetPos);
    ally.rotateY(-Math.PI / 2);

    const velocity = forward.clone().multiplyScalar(ALLY_SPEED);

    this.scene.add(ally);
    this.allies.push({ mesh: ally, velocity, age: 0 });
  }

  public update(delta: number): void {
    // FIX: Reverse iterate so splice doesn't skip entries
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const ally = this.allies[i];
      ally.age += delta;
      ally.mesh.position.addScaledVector(ally.velocity, delta);

      if (ally.age >= ALLY_LIFETIME) {
        this.scene.remove(ally.mesh);
        this.allies.splice(i, 1);
      }
    }
  }

  public clearAll(): void {
    // FIX: Cancel any pending second-ally spawn before it fires into a cleared scene
    if (this.pendingSpawn !== null) {
      clearTimeout(this.pendingSpawn);
      this.pendingSpawn = null;
    }

    for (const a of this.allies) this.scene.remove(a.mesh);
    this.allies = [];
  }
}
