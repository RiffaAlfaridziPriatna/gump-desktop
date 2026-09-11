import React from 'react';
import TestRenderer, {act, ReactTestInstance, ReactTestRenderer} from 'react-test-renderer';

export function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });

  return {
    renderer,
    rerender(next: React.ReactElement) {
      act(() => {
        renderer.update(next);
      });
    },
    unmount() {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

export function renderHook<T>(callback: () => T) {
  const result: {current: T} = {current: undefined as T};

  function Harness() {
    result.current = callback();
    return null;
  }

  const view = render(<Harness />);
  return {
    result,
    rerender() {
      view.rerender(<Harness />);
    },
    unmount: view.unmount,
  };
}

export function press(node: ReactTestInstance) {
  if (node.props.disabled || node.props.accessibilityState?.disabled) {
    return;
  }
  act(() => {
    node.props.onPress?.();
  });
}

export function getByLabel(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({accessibilityLabel: label});
}

export function getAllByRole(renderer: ReactTestRenderer, role: string) {
  return renderer.root.findAll(
    node => node.props.accessibilityRole === role,
  );
}
