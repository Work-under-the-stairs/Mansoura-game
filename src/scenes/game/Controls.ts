export class Controls {
    public keys: { [key: string]: boolean } = {};

    constructor() {
        // Use arrow functions to keep 'this' context if needed
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        // ShiftLeft, Space, ArrowUp, KeyW, etc.
        this.keys[e.code] = true;
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        this.keys[e.code] = false;
    };

    // Useful for cleaning up when switching scenes or destroying the engine
    public dispose() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }
}