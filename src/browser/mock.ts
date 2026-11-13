/** Generated participants: deliberately labeled synthetic, no devices or SDK. */
export class MockFeed {
  readonly canvas = document.createElement('canvas');
  frame = 0;
  readonly name: string;
  private context: CanvasRenderingContext2D;
  constructor(readonly index: number) {
    this.name = ['Alex Chen', 'Sam Rivera', 'Jordan Lee', 'Taylor Morgan', 'Casey Patel', 'Robin Kim',
      'Avery Jones', 'Drew Silva', 'Quinn Park', 'Jamie Ali', 'Riley Fox', 'Sky Nguyen'][index - 1]!;
    this.canvas.width = 1280; this.canvas.height = 720;
    this.context = this.canvas.getContext('2d', { alpha: false })!;
    this.canvas.setAttribute('aria-label', `${this.name} — MOCK participant ${index}`);
    this.draw();
  }
  draw(): void {
    const c = this.context, i = this.index, f = ++this.frame, hue = (i * 67) % 360;
    c.fillStyle = `hsl(${hue} 30% 15%)`; c.fillRect(0, 0, 1280, 720);
    c.fillStyle = `hsl(${hue} 35% 24%)`;
    for (let x = 0; x < 1280; x += 160) c.fillRect(x, 80, 2, 520);
    const sway = Math.sin(f / (15 + i)) * 35;
    c.fillStyle = `hsl(${hue} 42% 48%)`; c.beginPath(); c.ellipse(640 + sway, 670, 250, 230, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d6aa8d'; c.beginPath(); c.ellipse(640 + sway, 290, 112, 140, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#20242b'; c.beginPath(); c.ellipse(640 + sway, 180, 116, 50, -.1, 0, Math.PI * 2); c.fill();
    c.fillRect(600 + sway, 282, 12, 10); c.fillRect(672 + sway, 282, 12, 10);
    c.fillStyle = '#824e46'; c.fillRect(619 + sway, 345, 43, 4 + (Math.sin(f / 3 + i) + 1) * 8);
    c.fillStyle = '#101720'; c.fillRect(0, 0, 1280, 82); c.fillRect(0, 610, 1280, 110);
    c.fillStyle = '#edf5fc'; c.font = 'bold 34px monospace'; c.fillText(this.name, 30, 52);
    c.fillStyle = `hsl(${hue} 80% 74%)`; c.font = '24px monospace';
    c.fillText(`MOCK ${i} • GENERATED VIDEO • NOT A REAL CALL`, 30, 653);
    c.font = '18px monospace'; c.fillText(`1280×720 | frame ${f} | independent source ${i}`, 30, 694);
    for (let bar = 0; bar < 16; bar++) {
      const height = 10 + (Math.sin(f / 5 + bar + i) + 1) * 28;
      c.fillRect(930 + bar * 17, 560 - height, 9, height);
    }
  }
}
export class MockShare {
  readonly canvas = document.createElement('canvas');
  frame = 0;
  constructor() { this.canvas.width = 1280; this.canvas.height = 720; this.draw(); }
  draw(): void {
    const c = this.canvas.getContext('2d', { alpha: false })!, f = ++this.frame;
    c.fillStyle = '#f2f5f8'; c.fillRect(0, 0, 1280, 720);
    c.fillStyle = '#17384c'; c.fillRect(0, 0, 1280, 105);
    c.fillStyle = '#fff'; c.font = 'bold 38px monospace'; c.fillText('MOCK SCREEN SHARE · Team planning', 35, 65);
    c.fillStyle = '#223a48'; c.font = '28px monospace'; c.fillText('Native tmux call workspace', 45, 165);
    c.font = '22px monospace';
    ['One real session per call', 'One real pane per participant', 'Shared screen has its own pane', 'One media worker / one audio owner'].forEach((text, i) => c.fillText(`✓ ${text}`, 60, 230 + i * 60));
    for (let i = 0; i < 8; i++) { c.fillStyle = `hsl(${170 + i * 10} 45% 45%)`; c.fillRect(850 + i * 36, 520 - (i + 1) * 37, 25, (i + 1) * 37); }
    c.fillStyle = '#d65e48'; c.beginPath(); c.arc(70 + (f * 4) % 1100, 565, 10, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#223a48'; c.font = '20px monospace'; c.fillText(`Generated presentation • frame ${f} • no desktop capture`, 45, 660);
  }
}
