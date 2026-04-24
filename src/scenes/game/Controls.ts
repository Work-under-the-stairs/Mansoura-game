export class Controls {
    public keys: { [key: string]: boolean } = {};

    constructor() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        // window.addEventListener('keydown', (e) => console.log('Key pressed:', e.code));
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.keys[e.code] = true;
        // منع الصفحة من التمرير لما تضغطي Space أو الأسهم
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        this.keys[e.code] = false;
    };

    public dispose() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
}