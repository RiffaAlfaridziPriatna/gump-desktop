import React from 'react';
import {Text} from 'react-native';
import {ErrorProvider, useErrorActions} from '../../src/context/error';
import {ErrorToast} from '../../src/components/error/ErrorToast';
import {APIException} from '../../src/services/api/exception';
import {press, render} from '../helpers/render';

function ShowError({error}: {error: Error | APIException | string}) {
  const {showError} = useErrorActions();
  React.useEffect(() => {
    showError(error);
  }, [error, showError]);
  return <ErrorToast />;
}

describe('ErrorToast', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('renders an API error code and message', () => {
    const {renderer, unmount} = render(
      <ErrorProvider>
        <ShowError
          error={new APIException(401, 'Unauthorized', 'Please sign in', undefined)}
        />
      </ErrorProvider>,
    );

    const labels = renderer.root.findAllByType(Text).map(node => node.props.children);
    expect(labels).toContain('Unauthorized');
    expect(labels).toContain('Please sign in');
    unmount();
  });

  it('dismisses when the close control is pressed', () => {
    const {renderer, unmount} = render(
      <ErrorProvider>
        <ShowError error="Something broke" />
      </ErrorProvider>,
    );

    expect(
      renderer.root.findAllByType(Text).some(
        node => node.props.children === 'Something broke',
      ),
    ).toBe(true);

    const dismiss = renderer.root
      .findAllByType(Text)
      .find(node => node.props.children === 'Dismiss');
    expect(dismiss).toBeTruthy();
    press(dismiss!.parent!);
    unmount();
  });
});
