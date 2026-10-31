import {usePhotoNavigation} from '../src/hooks/usePhotoNavigation';
import {renderHook} from './helpers/render';

function setup(ids: string[], photoId: string) {
  const props = {ids, photoId};
  const hook = renderHook(() => usePhotoNavigation(props.ids, props.photoId));
  return {
    hook,
    go(nextPhotoId: string, nextIds = props.ids) {
      props.photoId = nextPhotoId;
      props.ids = nextIds;
      hook.rerender();
    },
  };
}

describe('usePhotoNavigation', () => {
  it('returns neighbours for an in-list photo', () => {
    const {hook} = setup(['a', 'b', 'c'], 'b');
    expect(hook.result.current).toEqual({prevId: 'a', nextId: 'c'});
    hook.unmount();
  });

  it('has no targets at the ends or when never in the list', () => {
    expect(setup(['a', 'b'], 'a').hook.result.current).toEqual({
      prevId: undefined,
      nextId: 'b',
    });
    expect(setup(['a', 'b'], 'x').hook.result.current).toEqual({
      prevId: undefined,
      nextId: undefined,
    });
  });

  it('keeps prev/next from the last in-list position when the photo is filtered out', () => {
    const {hook, go} = setup(['a', 'b', 'c'], 'b');
    go('hidden');
    expect(hook.result.current).toEqual({prevId: 'b', nextId: 'c'});
    hook.unmount();
  });

  it('clamps when the list shrank under the remembered position', () => {
    const {hook, go} = setup(['a', 'b', 'c'], 'c');
    go('hidden', ['a']);
    expect(hook.result.current).toEqual({prevId: 'a', nextId: undefined});
    hook.unmount();
  });
});
