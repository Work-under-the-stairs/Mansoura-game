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

  private readonly pages: string[] = [
    "معركة المنصورة الجوية: هي معركة جوية وقعت في 14 أكتوبر 1973 في طنطا والمنصورة والصالحية. وكانت أكبر هجوم جوي تشنه إسرائيل بقوة قُدرت بحوالي 120 طائرة إسرائيلية.",
    "وقد انتهت المعركة بالنصر للقوات المصرية بعد أطول وأكبر معركة جوية استمرت 53 دقيقة. وكانت هذه المعركة علامة فارقة في تاريخ سلاح الجو المصري.",
  ];
  private currentPage = 0;
  private typingInterval: ReturnType<typeof setInterval> | null = null;

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
      (gltf: GLTF) => {
        const scrollMesh = gltf.scene;
        this.scrollMesh = scrollMesh;
        scrollMesh.rotation.x = Math.PI / 2;
        scrollMesh.rotation.y = Math.PI;
        scrollMesh.scale.set(1.6, 1.2, 1.2);
        this.scene.add(scrollMesh);

        this.gltfAnimations = gltf.animations;
        this.mixer = new THREE.AnimationMixer(scrollMesh);

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
      (error: unknown) => console.error("Error loading model:", error)
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
          /* Extreme margins to force text into a narrow central column */
          top: 25%;
          bottom: 25%;
          left: 30%;
          right: 30%;
          
          /* Strictly limit the width to 40% of the screen */
          width: 40%;
          max-width: 40vw;
          margin: 0 auto;

          text-align: center;
          font-family: 'Amiri', serif;
          color: #2b1b0a;
          text-shadow: 0.5px 0.5px 1px rgba(0,0,0,0.1);
          
          direction: rtl;
          /* Even more conservative font sizing for safety */
          font-size: clamp(0.9rem, 1.8vw, 1.2rem);
          font-weight: 700;
          line-height: 1.5;

          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;

          overflow: hidden;
          white-space: pre-wrap; 
          word-break: normal;
          overflow-wrap: break-word;

          padding: 10px 15px;
          z-index: 10;
          pointer-events: none;
          box-sizing: border-box;
        }

        #ns-text-content {
           width: 100%;
           max-height: 100%;
        }

        #ns-next-btn {
          position: absolute;
          bottom: 18%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;

          font-family: 'Amiri', serif;
          font-size: 1.1rem;
          color: #2b1b0a;
          background: rgba(205, 170, 100, 0.35);
          border: 2px solid #8b6914;
          border-radius: 8px;
          padding: 8px 32px;
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: background 0.2s, transform 0.15s;
          display: none;
          pointer-events: all;
          direction: rtl;
        }

        #ns-next-btn:hover {
          background: rgba(205, 170, 100, 0.65);
          transform: translateX(-50%) scale(1.05);
        }

        #ns-page-indicator {
          position: absolute;
          bottom: 13%;
          left: 50%;
          transform: translateX(-50%);
          z-index: 20;
          display: flex;
          gap: 8px;
          pointer-events: none;
        }

        .ns-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #8b6914;
          opacity: 0.3;
          transition: opacity 0.3s;
        }

        .ns-dot.active {
          opacity: 1;
        }
      </style>
      <div id="ns-bg"></div>
      <div id="ns-bg-overlay"></div>

      <div id="ns-scroll-area">
        <div id="ns-text-container">
          <div id="ns-text-content"></div>
        </div>
        <button id="ns-next-btn">التالي ›</button>
        <div id="ns-page-indicator">
          <div class="ns-dot active"></div>
          <div class="ns-dot"></div>
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
    this.currentPage = 0;
    this._typeCurrentPage();
  }

  private _typeCurrentPage() {
    const container = this.overlay.querySelector("#ns-text-container") as HTMLElement;
    const content = this.overlay.querySelector("#ns-text-content") as HTMLElement;
    const nextBtn = this.overlay.querySelector("#ns-next-btn") as HTMLButtonElement;
    const dots = this.overlay.querySelectorAll(".ns-dot");
    if (!content || !container) return;

    // Clear previous state
    if (this.typingInterval) clearInterval(this.typingInterval);
    nextBtn.style.display = "none";
    content.textContent = "";

    // Update page dots
    dots.forEach((d, i) => {
      d.classList.toggle("active", i === this.currentPage);
    });

    const pageText = this.pages[this.currentPage];
    let i = 0;

    this.typingInterval = setInterval(() => {
      if (i < pageText.length) {
        content.textContent += pageText[i];
        i++;

        // Strict vertical overflow check
        if (content.scrollHeight > container.clientHeight) {
          content.textContent = content.textContent.slice(0, -1);
          clearInterval(this.typingInterval!);
          this.typingInterval = null;
          this._handlePageEnd(nextBtn);
        }
      } else {
        clearInterval(this.typingInterval!);
        this.typingInterval = null;
        this._handlePageEnd(nextBtn);
      }
    }, 60);
  }

  private _handlePageEnd(nextBtn: HTMLButtonElement) {
    const content = this.overlay.querySelector("#ns-text-content") as HTMLElement;
    const isLastPage = this.currentPage === this.pages.length - 1;

    if (!isLastPage) {
      nextBtn.style.display = "block";
      nextBtn.textContent = "التالي ›";
      nextBtn.onclick = () => {
        nextBtn.style.display = "none";
        // Clear text content before starting transition
        if (content) content.textContent = "";
        this.currentPage++;
        this._closeAndReopenScroll(() => this._typeCurrentPage());
      };
    } else {
      // Show "ابدأ" button on the last page
      nextBtn.style.display = "block";
      nextBtn.textContent = "ابدأ";
      nextBtn.onclick = () => {
        nextBtn.style.display = "none";
        this.hide();
        if (this.onCompleteCallback) this.onCompleteCallback();
      };
    }
  }

  private _closeAndReopenScroll(onDone: () => void) {
    // Play close animation
    if (this.mixer && this.actions.length > 0) {
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
    }

    // After close, re-open and type next page
    setTimeout(() => {
      this.mixerPaused = true;
      this.playOpenAnimations();
      setTimeout(() => onDone(), 4000);
    }, 1800);
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

  public hide(): void {
    this.destroy();
  }

  public destroy() {
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }

    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}
