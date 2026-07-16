import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { motion } from 'framer-motion';
import { describe, it, expect, vi } from 'vitest';

// Verifies the assumption the drag-to-move feature relies on: framer-motion's
// motion.div forwards native HTML5 onDragOver/onDrop to the DOM (only
// onDragStart/onDrag/onDragEnd are remapped to pointer-gesture callbacks).
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  return { container, cleanup: () => act(() => root.unmount()) };
}

describe('framer-motion forwards native HTML5 DnD handlers', () => {
  it('fires onDragOver and onDrop on a motion.div', () => {
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const { container, cleanup } = mount(
      <motion.div data-testid="cat" onDragOver={onDragOver} onDrop={onDrop}>zone</motion.div>
    );
    const el = container.querySelector('[data-testid="cat"]')!;
    act(() => { el.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })); });
    act(() => { el.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })); });
    expect(onDragOver).toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalled();
    cleanup();
  });

  it('a child stopPropagation keeps the parent (motion.div) onDrop from firing', () => {
    const parentDrop = vi.fn();
    const childDrop = vi.fn((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); });
    const { container, cleanup } = mount(
      <motion.div data-testid="card" onDrop={parentDrop}>
        <div data-testid="row" onDrop={childDrop}>row</div>
      </motion.div>
    );
    const row = container.querySelector('[data-testid="row"]')!;
    act(() => { row.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })); });
    expect(childDrop).toHaveBeenCalled();
    expect(parentDrop).not.toHaveBeenCalled();
    cleanup();
  });
});
