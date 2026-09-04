const React = require('react');

const SvgMock = React.forwardRef((props, ref) =>
  React.createElement('SvgMock', {...props, ref}),
);

SvgMock.displayName = 'SvgMock';

module.exports = SvgMock;
module.exports.default = SvgMock;
module.exports.ReactComponent = SvgMock;
