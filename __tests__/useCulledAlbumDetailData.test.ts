import {act} from 'react-test-renderer';

const mockUpdateSelection = jest.fn();
const mockReportError = jest.fn();

jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumStore: () => null,
}));
jest.mock('@lib/culling/cullingEngine', () => ({
  cullingEngine: {
    updateSelection: (...args: unknown[]) => mockUpdateSelection(...args),
  },
}));
jest.mock('@lib/observability/reportError', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import {useCulledAlbumDetailData} from '../src/hooks/useCulledAlbumDetailData';
import {renderHook} from './helpers/render';

describe('useCulledAlbumDetailData toggleSelection', () => {
  beforeEach(() => {
    mockUpdateSelection.mockReset();
    mockReportError.mockReset();
  });

  it('reports a rejected pick toggle instead of leaving it unhandled', async () => {
    const error = new Error('Cannot modify photos after upload');
    mockUpdateSelection.mockRejectedValue(error);
    const hook = renderHook(() => useCulledAlbumDetailData('album-1', []));

    await act(async () => {
      await hook.result.current.toggleSelection('photo-1', true);
    });

    expect(mockUpdateSelection).toHaveBeenCalledWith('album-1', 'photo-1', {
      selected: true,
    });
    expect(mockReportError).toHaveBeenCalledWith(error, {
      source: 'culled_album_grid',
      operation: 'toggle_pick',
    });
  });
});
