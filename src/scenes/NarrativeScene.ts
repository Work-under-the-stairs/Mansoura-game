import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

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

  private readonly text = "معركة المنصورة الجوية: هي معركة جوية وقعت في 14 أكتوبر 1973 في طنطا والمنصورة والصالحية. وكانت أكبر هجوم جوي تشنه إسرائيل بقوة قُدرت بحوالي 120 طائرة إسرائيلية وقد انتهت بالنصر للقوات المصرية بعد أطول وأكبر معركة جوية استمرت 53 دقيقة.";

  private typingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private container: HTMLElement) {
    this.overlay = this.createOverlay();
    this.initScene();
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.zIndex = "1";
    this.renderer.domElement.style.pointerEvents = "none";

    const scrollArea = this.overlay.querySelector("#ns-scroll-area") as HTMLElement;
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
    loader.load("/models/paperScrollDone.glb", (gltf: GLTF) => {
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
        return action;
      });

      this.modelReady = true;
      if (this.pendingShow) {
        this.pendingShow = false;
        this._playAndType();
      }
    });
  }

  private playOpenAnimations() {
    if (!this.mixer || this.actions.length === 0) return;
    this.mixerPaused = false;
    this.mixer.stopAllAction();
    this.actions.forEach((action) => action.reset().play());
    setTimeout(() => { this.mixerPaused = true; }, 4000);
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
          opacity: 0;
          transition: opacity 1s;
          pointer-events: none;
          justify-content: center;
          align-items: center;
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
          z-index: 0;
        }
        #ns-bg-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 1;
        }

        #ns-scroll-area {
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        /*
          الحاوية الرئيسية — بتتمركز فوق اللفافة بالظبط
          min-height بدل height عشان الكلام ميتقطعش
        */
        #ns-text-container {
          position: absolute;

          /* التمركز الأفقي */
          left: 50%;
          transform: translateX(-50%);

          /*
            top بيتحكم في ارتفاع الكلام على اللفافة
            clamp: موبايل=28% ← لاب=32% ← شاشة كبيرة=35%
          */
          top: clamp(28%, 5vw + 20%, 35%);

          /*
            العرض مرتبط بالـ viewport
            موبايل: 55vw ← لاب: 32vw ← شاشة كبيرة: 28vw
          */
          width: clamp(220px, 32vw, 520px);

          min-height: 10px;

          /* النص */
          font-family: 'Amiri', serif;
          font-weight: 700;
          color: #2b1b0a;
          direction: rtl;
          text-align: right;

          /*
            حجم الخط:
            موبايل (360px wide)  → ~0.75rem  ≈ 12px
            لاب    (1440px wide) → ~1.1rem   ≈ 17px
            شاشة كبيرة          → max 1.3rem ≈ 21px
          */
          font-size: clamp(0.62rem, 1.7vw, 6rem);

          /*
            تباعد السطور — أكبر من الافتراضي عشان الخط العربي يتنفس
          */
          line-height: 2.5;

          overflow: hidden;
          z-index: 10;
          pointer-events: none;
        }

        #ns-text-content {
          display: block;
          width: 100%;
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* زر تخطي / ابدأ */
        #ns-action-btn {
          position: absolute;
          bottom: 18%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;
          font-family: 'Amiri', serif;
          font-size: clamp(0.85rem, 1.2vw, 1.1rem);
          color: #2b1b0a;
          background: rgba(205,170,100,0.4);
          border: 2px solid #8b6914;
          border-radius: 8px;
          padding: 8px 30px;
          cursor: pointer;
          transition: all 0.2s;
          display: none;
          pointer-events: all;
          white-space: nowrap;
        }
        #ns-action-btn:hover {
          background: rgba(205,170,100,0.7);
          transform: translateX(-50%) scale(1.05);
        }

        /* موبايل — اللفافة بتبقى أصغر فالكلام محتاج يتضبط */
        @media (max-width: 768px) {
          #ns-text-container {
            top: clamp(25%, 8vw + 15%, 32%);
            width: clamp(160px, 52vw, 300px);
            font-size: clamp(0.6rem, 2.2vw, 0.85rem);
            line-height: 1.9;
          }
          #ns-action-btn {
            bottom: 25%;
            font-size: clamp(0.75rem, 3vw, 0.95rem);
            padding: 6px 22px;
          }
        }
      </style>

      <div id="ns-bg"></div>
      <div id="ns-bg-overlay"></div>
      <div id="ns-scroll-area">
        <div id="ns-text-container">
          <span id="ns-text-content"></span>
        </div>
        <button id="ns-action-btn">تخطي</button>
      </div>
    `;
    this.container.appendChild(el);
    return el;
  }

  public show(): void {
    this.overlay.classList.add("visible");
    if (this.modelReady) {
      this._playAndType();
    } else {
      this.pendingShow = true;
    }
  }

  private _playAndType() {
    this.playOpenAnimations();
    setTimeout(() => this._startTyping(), 4000);
  }

  private _startTyping() {
    const content = this.overlay.querySelector("#ns-text-content") as HTMLElement;
    const btn = this.overlay.querySelector("#ns-action-btn") as HTMLButtonElement;
    if (!content || !btn) return;

    content.textContent = "";
    btn.style.display = "block";
    btn.textContent = "تخطي ›";

    btn.onclick = () => {
      if (this.typingInterval) clearInterval(this.typingInterval);
      content.textContent = this.text;
      this._switchToStartMode(btn);
    };

    let i = 0;
    this.typingInterval = setInterval(() => {
      if (i < this.text.length) {
        content.textContent += this.text[i];
        i++;
      } else {
        clearInterval(this.typingInterval!);
        this._switchToStartMode(btn);
      }
    }, 45);
  }

  private _switchToStartMode(btn: HTMLButtonElement) {
    btn.textContent = "ابدأ المعركة";
    btn.style.fontWeight = "bold";
    btn.onclick = () => {
      this.destroy();
      if (this.onCompleteCallback) this.onCompleteCallback();
    };
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    if (this.mixer && !this.mixerPaused) this.mixer.update(this.clock.getDelta());
    this.renderer.render(this.scene, this.camera);
  };

  public onComplete(callback: () => void) {
    this.onCompleteCallback = callback;
  }

  public destroy() {
    if (this.typingInterval) clearInterval(this.typingInterval);
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.overlay.remove();
  }
}