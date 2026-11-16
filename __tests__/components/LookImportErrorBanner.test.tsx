import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { LookImportErrorBanner } from '../../src/components/look/LookImportErrorBanner';
import { render } from '../helpers/render';

describe('LookImportErrorBanner', () => {
  it.each([
    ['unsupported', "Unsupported file format. Your album look hasn't changed."],
    ['unreadable', "This file can't be read. Your album look hasn't changed."],
  ] as const)('shows the %s message and announces it as an alert', (error, message) => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation();
    const { renderer } = render(<LookImportErrorBanner error={error} />);
    expect(announce).toHaveBeenCalledWith(message);
    const banner = renderer.root.find(
      node => node.props.accessibilityRole === 'alert',
    );
    expect(banner.props.accessibilityLiveRegion).toBe('assertive');
    expect(banner.props.accessibilityLabel).toBe(message);
    expect(renderer.root.findByType(Text).props.children).toBe(message);
  });
});
