/** Pointer IDs belong to individual controls; never use isPrimary for multitouch. */
export class Input {
  readonly movement = { x: 0, y: 0 };
  private joystickPointer: number | null = null;
  private dashPointer: number | null = null;
  private keys = new Set<string>();
  private touchX = 0;
  private touchY = 0;
  private dashQueued = false;
  private jumpQueued = false;
  private jumpPointer: number | null = null;
  private enabled = false;
  private movementOnly = false;
  private events = new AbortController();
  private knob: HTMLElement;

  constructor(private joystick: HTMLElement, private dash: HTMLButtonElement, private jump?: HTMLButtonElement) {
    this.knob = joystick.querySelector<HTMLElement>('.joystick-knob')!;
    const options = { signal: this.events.signal };
    joystick.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.joystickPointer !== null || event.button > 0) return;
      event.preventDefault();
      this.joystickPointer = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      joystick.classList.add('active');
      this.moveJoystick(event);
    }, options);
    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.joystickPointer) this.moveJoystick(event);
    }, options);
    const releaseJoystick = (event: PointerEvent) => {
      if (event.pointerId === this.joystickPointer) this.clearJoystick();
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      joystick.addEventListener(name, releaseJoystick, options);
      dash.addEventListener(name, (event) => {
        if (event.pointerId !== this.dashPointer) return;
        this.dashPointer = null;
        dash.classList.remove('pressed');
      }, options);
    }
    dash.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.movementOnly || this.dashPointer !== null || event.button > 0) return;
      event.preventDefault();
      this.dashPointer = event.pointerId;
      dash.setPointerCapture(event.pointerId);
      dash.classList.add('pressed');
      this.dashQueued = true;
    }, options);
    jump?.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.movementOnly || this.jumpPointer !== null || event.button > 0) return;
      event.preventDefault(); this.jumpPointer = event.pointerId;
      jump.setPointerCapture(event.pointerId); jump.classList.add('pressed'); this.jumpQueued = true;
    }, options);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) jump?.addEventListener(name, (event) => {
      if (event.pointerId !== this.jumpPointer) return;
      this.jumpPointer = null; jump.classList.remove('pressed');
    }, options);
    jump?.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    window.addEventListener('keydown', (event) => {
      if (!this.enabled) return;
      if (this.movementOnly && ['Space', 'ShiftLeft', 'ShiftRight', 'KeyJ'].includes(event.code)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyJ'].includes(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        if (!event.repeat && event.code === 'KeyJ') this.jumpQueued = true;
        if (!event.repeat && ['Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) this.dashQueued = true;
      }
    }, options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.reset(), options);
    joystick.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    dash.addEventListener('contextmenu', (event) => event.preventDefault(), options);
  }

  private moveJoystick(event: PointerEvent) {
    const rect = this.joystick.getBoundingClientRect();
    const radius = rect.width * 0.34;
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    this.knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    const magnitude = Math.min(length, 1);
    const strength = Math.max(0, (magnitude - 0.14) / 0.86);
    this.touchX = magnitude > 0 ? x / magnitude * strength : 0;
    this.touchY = magnitude > 0 ? y / magnitude * strength : 0;
  }

  sample() {
    const x = this.touchX + Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const y = this.touchY + Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    const length = Math.max(1, Math.hypot(x, y));
    this.movement.x = x / length;
    this.movement.y = y / length;
    return this.movement;
  }

  consumeDash() {
    const queued = this.dashQueued;
    this.dashQueued = false;
    return queued;
  }

  consumeJump() { const queued = this.jumpQueued; this.jumpQueued = false; return queued; }

  private clearJoystick() {
    const id = this.joystickPointer;
    this.joystickPointer = null;
    if (id !== null && this.joystick.hasPointerCapture(id)) this.joystick.releasePointerCapture(id);
    this.touchX = this.touchY = 0;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.joystick.classList.remove('active');
  }

  reset() {
    this.clearJoystick();
    const id = this.dashPointer;
    this.dashPointer = null;
    if (id !== null && this.dash.hasPointerCapture(id)) this.dash.releasePointerCapture(id);
    const jumpId = this.jumpPointer; this.jumpPointer = null;
    if (jumpId !== null && this.jump?.hasPointerCapture(jumpId)) this.jump.releasePointerCapture(jumpId);
    this.jump?.classList.remove('pressed'); this.jumpQueued = false;
    this.keys.clear();
    this.dashQueued = false;
    this.dash.classList.remove('pressed');
    this.movement.x = this.movement.y = 0;
  }

  setEnabled(enabled: boolean) {
    // Repeated frame-level synchronization must preserve held keys and pointer capture.
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.reset();
  }

  setMovementOnly(enabled: boolean) { this.movementOnly = enabled; this.reset(); }

  dispose() { this.reset(); this.events.abort(); }
}
