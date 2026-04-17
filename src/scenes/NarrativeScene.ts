import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

export class NarrativeScene {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mixer?: THREE.AnimationMixer;
  private scrollMesh?: THREE.Group;
  private overlay: HTMLElement;
  private onCompleteCallback: (() => void) | null = null;
  private clock = new THREE.Clock();

  private modelReady = false;
  private pendingShow = false;
  private gltfAnimations: THREE.AnimationClip[] = [];
  private actions: THREE.AnimationAction[] = [];
  private mixerPaused = false;

  private readonly text =
"معركة المنصورة الجوية: هي معركة جوية وقعت في 14 أكتوبر 1973 في طنطا والمنصورة والصالحية. وكانت أكبر هجوم جوي تشنه إسرائيل بقوة قُدرت بحوالي 120 طائرة إسرائيلية وقد انتهت بالنصر للقوات المصرية بعد أطول وأكبر معركة جوية استمرت 53 دقيقة.";

  constructor(private container: HTMLElement) {
    this.overlay = this.createOverlay();
    this.initScene();
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.zIndex = "1";
    this.renderer.domElement.style.pointerEvents = "none";

    const scrollArea = this.overlay.querySelector(
      "#ns-scroll-area"
    ) as HTMLElement;
    scrollArea.appendChild(this.renderer.domElement);

    this.addLights();
    this.loadScrollModel();
    this.animate();

    window.addEventListener("resize", this.onResize);
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private addLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 5, 5);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  }

  private loadScrollModel() {
    const loader = new GLTFLoader();
    loader.load(
      "/models/paperScrollDone.glb",
      (gltf) => {
        this.scrollMesh = gltf.scene;
        this.scrollMesh.rotation.x = Math.PI / 2;
        this.scrollMesh.rotation.y = Math.PI;
        this.scrollMesh.scale.set(1.6, 1.2, 1.2);
        this.scene.add(this.scrollMesh);

        this.gltfAnimations = gltf.animations;
        this.mixer = new THREE.AnimationMixer(this.scrollMesh);

        this.actions = this.gltfAnimations.map((clip) => {
          const action = this.mixer!.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.timeScale = 1;
          return action;
        });

        this.modelReady = true;

        if (this.pendingShow) {
          this.pendingShow = false;
          this._playAndType();
        }
      },
      undefined,
      (error) => console.error("Error loading model:", error)
    );
  }

  private playOpenAnimations() {
    if (!this.mixer || this.actions.length === 0) return;

    this.mixerPaused = false;
    this.mixer.stopAllAction();

    this.actions.forEach((action) => {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
      action.play();
    });

    setTimeout(() => {
      this.mixerPaused = true;
    }, 4000);
  }

  public close(): void {
    if (!this.mixer || this.actions.length === 0) return;

    this.mixerPaused = false;
    this.mixer.stopAllAction();

    this.actions.forEach((action) => {
      const clip = action.getClip();
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = -1;
      action.time = clip.duration;
      action.play();
    });

    setTimeout(() => {
      this.mixerPaused = true;
    }, 1800);
  }

  private createOverlay(): HTMLElement {
    const el = document.createElement("div");
    el.id = "narrative-screen";
    el.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');

        #narrative-screen {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 1s ease;
          pointer-events: none;
        }

        #narrative-screen.visible {
          opacity: 1;
          pointer-events: all;
        }

        #ns-bg {
          position: absolute;
          inset: 0;
          background-image: url('/images/main-menu-bg.png');
          background-size: cover;
          background-position: center;
          z-index: 0;
        }

        #ns-bg-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          z-index: 1;
        }

        #ns-scroll-area {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        #ns-text-container {
          position: absolute;
          top: 30%;
          left: 50%;
          transform: translateX(-50%);

          width: 600px; 
          max-height: 400px;

          text-align: right; 
          font-family: 'Amiri', serif;
          color: #2b1b0a;
          text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.15);
          
          direction: rtl;
          font-size: 1.7rem; 
          font-weight: 400;
          line-height: 2.5;

          display: flex;
          flex-direction: column;
          justify-content: flex-start; 

          overflow: visible;
          white-space: pre-wrap; 
          word-break: break-word;
          overflow-wrap: break-word;

          padding: 10px 40px; 
          z-index: 10;
          pointer-events: none;
        }

        #ns-text-content {
           min-height: 100%;
        }
      </style>

      <div id="ns-bg"></div>
      <div id="ns-bg-overlay"></div>

      <div id="ns-scroll-area">
        <div id="ns-text-container">
          <div id="ns-text-content"></div>
        </div>
      </div>
    `;

    this.container.appendChild(el);
    return el;
  }

  public show(): void {
    this.overlay.classList.add("visible");

    if (this.modelReady) {
      setTimeout(() => this._playAndType(), 0);
    } else {
      this.pendingShow = true;
    }
  }

  private _playAndType() {
    this.playOpenAnimations();
    setTimeout(() => this._startTyping(), 4000);
  }

  private _startTyping() {
    const content = this.overlay.querySelector(
      "#ns-text-content"
    ) as HTMLElement;
    if (!content) return;
    
    content.textContent = ""; 
    let i = 0;

    const interval = setInterval(() => {
      if (i < this.text.length) {
        content.textContent += this.text[i];
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          if (this.onCompleteCallback) this.onCompleteCallback();
        }, 5000);
      }
    }, 60);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    if (this.mixer && !this.mixerPaused) {
      this.mixer.update(delta);
    }
    this.renderer.render(this.scene, this.camera);
  };

  public onComplete(callback: () => void) {
    this.onCompleteCallback = callback;
  }

  public destroy() {
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}