import {
  cullingStatusColors,
  getEyeStatusMeta,
  getFocusStatusMeta,
} from '../src/lib/culling/faceStatus';

describe('faceStatus', () => {
  it('maps eye states to labels and colors', () => {
    expect(getEyeStatusMeta('open')).toMatchObject({
      label: 'Open Eyes',
      color: cullingStatusColors.good,
    });
    expect(getEyeStatusMeta('partial')).toMatchObject({
      label: 'Partial Eyes',
      color: cullingStatusColors.warning,
    });
    expect(getEyeStatusMeta('closed')).toMatchObject({
      label: 'Closed Eyes',
      color: cullingStatusColors.bad,
    });
  });

  it('maps focus states to labels and colors', () => {
    expect(getFocusStatusMeta('good')).toMatchObject({
      label: 'Good Focus',
      color: cullingStatusColors.good,
    });
    expect(getFocusStatusMeta('soft')).toMatchObject({
      label: 'Soft Focus',
      color: cullingStatusColors.warning,
    });
    expect(getFocusStatusMeta('blurred')).toMatchObject({
      label: 'Blurred',
      color: cullingStatusColors.bad,
    });
  });
});
