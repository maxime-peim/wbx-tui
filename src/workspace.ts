import type { Layout } from './config.js';
import type { Source } from './protocol.js';

export interface Pane { id: number; source: Source; title?: string }
type Node = Pane | { direction: 'vertical' | 'horizontal'; ratio: number; children: [Node, Node] };
export interface Rect { x: number; y: number; width: number; height: number }
export interface PositionedPane extends Pane, Rect {}
const isPane = (node: Node): node is Pane => 'id' in node;
export class Workspace {
  private serial = 0;
  private root!: Node;
  focus = 0;
  maximized = false;
  revision = 0;
  constructor(layout: Layout) { this.load(layout); }
  load(layout: Layout): void {
    const build = (value: Layout): Node => 'source' in value ? { ...value, id: ++this.serial }
      : { ...value, children: [build(value.children[0]), build(value.children[1])] };
    this.root = build(layout); this.focus = this.panes()[0]!.id; this.maximized = false; this.revision++;
  }
  panes(): Pane[] {
    const visit = (node: Node): Pane[] => isPane(node) ? [node] : node.children.flatMap(visit);
    return visit(this.root);
  }
  selected(): Pane { return this.panes().find(pane => pane.id === this.focus)!; }
  layout(): Layout {
    const visit = (node: Node): Layout => isPane(node) ? { source: node.source, ...(node.title ? { title: node.title } : {}) }
      : { ...node, children: [visit(node.children[0]), visit(node.children[1])] };
    return visit(this.root);
  }
  positions(width: number, height: number, y = 2): PositionedPane[] {
    const rect = { x: 1, y, width: Math.max(1, width), height: Math.max(1, height) };
    if (this.maximized) return [{ ...this.selected(), ...rect }];
    const visit = (node: Node, r: Rect): PositionedPane[] => {
      if (isPane(node)) return [{ ...node, ...r }];
      const vertical = node.direction === 'vertical', total = vertical ? r.width : r.height;
      if (total < 2) return visit(node.children[0], r); // tiny terminals: no overlapping panes
      const first = Math.max(1, Math.min(total - 1, Math.round(total * node.ratio)));
      return [...visit(node.children[0], { ...r, [vertical ? 'width' : 'height']: first }),
        ...visit(node.children[1], { ...r, [vertical ? 'x' : 'y']: (vertical ? r.x : r.y) + first, [vertical ? 'width' : 'height']: total - first })];
    };
    return visit(this.root, rect);
  }
  cycle(delta: number): void {
    const panes = this.panes(), index = panes.findIndex(pane => pane.id === this.focus);
    this.focus = panes[(index + delta + panes.length) % panes.length]!.id; this.revision++;
  }
  direction(direction: string, width: number, height: number): void {
    const panes = this.positions(width, height), current = panes.find(pane => pane.id === this.focus);
    if (!current) { this.cycle(1); return; }
    const cx = current.x + current.width / 2, cy = current.y + current.height / 2;
    const horizontal = direction === 'left' || direction === 'right', sign = direction === 'left' || direction === 'up' ? -1 : 1;
    const ranked = panes.filter(pane => pane.id !== current.id).map(pane => {
      const dx = pane.x + pane.width / 2 - cx, dy = pane.y + pane.height / 2 - cy;
      return { pane, primary: (horizontal ? dx : dy) * sign, distance: Math.abs(horizontal ? dx : dy) + Math.abs(horizontal ? dy : dx) * 2 };
    }).filter(item => item.primary > 0).sort((a, b) => a.distance - b.distance);
    if (ranked[0]) { this.focus = ranked[0].pane.id; this.revision++; }
  }
  private replace(id: number, replacement: (pane: Pane) => Node): void {
    const visit = (node: Node): Node => isPane(node) ? node.id === id ? replacement(node) : node
      : { ...node, children: [visit(node.children[0]), visit(node.children[1])] };
    this.root = visit(this.root); this.revision++;
  }
  source(source: Source): void { this.selected().source = source; this.revision++; }
  split(direction: 'vertical' | 'horizontal', source: Source): void {
    if (this.panes().length >= 16) throw new Error('Maximum 16 panes.');
    const pane = { id: ++this.serial, source };
    this.replace(this.focus, current => ({ direction, ratio: .5, children: [current, pane] }));
    this.focus = pane.id; this.maximized = false;
  }
  close(): void {
    if (this.panes().length === 1) return;
    const visit = (node: Node): Node | undefined => {
      if (isPane(node)) return node.id === this.focus ? undefined : node;
      const a = visit(node.children[0]), b = visit(node.children[1]);
      return a && b ? { ...node, children: [a, b] } : a ?? b;
    };
    this.root = visit(this.root)!; this.focus = this.panes()[0]!.id; this.maximized = false; this.revision++;
  }
  only(): void { this.root = this.selected(); this.maximized = false; this.revision++; }
  maximize(): void { this.maximized = !this.maximized; this.revision++; }
  resize(delta: number): void {
    const contains = (node: Node): boolean => isPane(node) ? node.id === this.focus : node.children.some(contains);
    const visit = (node: Node): boolean => {
      if (isPane(node)) return false;
      if (node.children.some(child => !isPane(child) && contains(child) && visit(child))) return true;
      if (!contains(node)) return false;
      node.ratio = Math.max(.1, Math.min(.9, node.ratio + (contains(node.children[0]) ? delta : -delta))); return true;
    };
    visit(this.root); this.revision++;
  }
}
