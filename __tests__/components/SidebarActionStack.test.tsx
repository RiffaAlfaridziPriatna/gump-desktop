import React from 'react';
import {Text} from 'react-native';
import {SidebarActionStack} from '../../src/components/culling/SidebarActionStack';
import {getByLabel, press, render} from '../helpers/render';

type Props = React.ComponentProps<typeof SidebarActionStack>;

const UPLOAD = 'Upload 3 picked photos';
const ADD = 'Add photos to cull';
const EXPORT = 'Export picked photos';
const EDIT = 'Edit photos';

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    actionCount: 3,
    onUploadSelected: jest.fn(),
    onAddPhotos: jest.fn(),
    onExport: jest.fn(),
    onEditPhotos: jest.fn(),
    ...overrides,
  };
  const {renderer} = render(<SidebarActionStack {...props} />);
  return {props, renderer};
}

describe('SidebarActionStack', () => {
  it('orders Upload, Add Photos, Export, Edit Photos', () => {
    const {renderer} = setup();
    const texts = renderer.root.findAllByType(Text).map(t => t.props.children);
    expect(texts).toEqual([
      'Upload Picked (3)',
      'Add Photos to Cull',
      'Export',
      'Edit Photos',
    ]);
  });

  it('labels Edit Photos without "Apply look"', () => {
    const {renderer} = setup();
    expect(getByLabel(renderer, EDIT)).toBeTruthy();
    expect(
      renderer.root.findAll(n =>
        /apply look/i.test(String(n.props.accessibilityLabel ?? '')),
      ),
    ).toHaveLength(0);
  });

  it('omits Add Photos without callback', () => {
    const {renderer} = setup({onAddPhotos: undefined});
    expect(
      renderer.root.findAll(n => n.props.accessibilityLabel === ADD),
    ).toHaveLength(0);
  });

  it('fires each callback', () => {
    const {props, renderer} = setup();
    [UPLOAD, ADD, EXPORT, EDIT].forEach(l => press(getByLabel(renderer, l)));
    expect(props.onUploadSelected).toHaveBeenCalledTimes(1);
    expect(props.onAddPhotos).toHaveBeenCalledTimes(1);
    expect(props.onExport).toHaveBeenCalledTimes(1);
    expect(props.onEditPhotos).toHaveBeenCalledTimes(1);
  });

  it('does not fire disabled buttons and marks them disabled', () => {
    const {props, renderer} = setup({
      addPhotosDisabled: true,
      exportDisabled: true,
      editPhotosDisabled: true,
    });
    [ADD, EXPORT, EDIT].forEach(l => {
      const node = getByLabel(renderer, l);
      expect(node.props.disabled).toBe(true);
      press(node);
    });
    expect(props.onAddPhotos).not.toHaveBeenCalled();
    expect(props.onExport).not.toHaveBeenCalled();
    expect(props.onEditPhotos).not.toHaveBeenCalled();
  });

  it('disables Edit Photos with a hint for an empty album', () => {
    const {renderer} = setup({editPhotosDisabled: true});
    const edit = getByLabel(renderer, EDIT);
    expect(edit.props.accessibilityState).toEqual({disabled: true});
    expect(edit.props.accessibilityHint).toBe('Add photos to edit');
  });
});
