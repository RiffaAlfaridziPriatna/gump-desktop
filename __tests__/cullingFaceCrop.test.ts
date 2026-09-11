import {
  boundingBoxToDisplayRect,
  getContainedImageLayout,
} from '../src/lib/culling/cullingFaceCrop';

describe('cullingFaceCrop', () => {
  it('letterboxes a landscape image in a square container', () => {
    const layout = getContainedImageLayout(200, 200, 400, 200);
    expect(layout).toEqual({
      width: 200,
      height: 100,
      left: 0,
      top: 50,
    });
  });

  it('maps a normalized face box onto the displayed image', () => {
    const imageLayout = {left: 10, top: 20, width: 100, height: 200};
    expect(
      boundingBoxToDisplayRect(
        {left: 0.1, top: 0.2, width: 0.5, height: 0.25},
        imageLayout,
      ),
    ).toEqual({
      left: 20,
      top: 60,
      width: 50,
      height: 50,
    });
  });
});
