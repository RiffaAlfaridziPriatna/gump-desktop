import {TouchableOpacity} from 'react-native';
import CheckboxChecked from '../../assets/images/checkbox_checked.svg';
import CheckboxUnchecked from '../../assets/images/checkbox_unchecked.svg';

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  size?: number;
};

export function Checkbox({checked, onToggle, size = 20}: CheckboxProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}>
      {checked ? (
        <CheckboxChecked width={size} height={size} />
      ) : (
        <CheckboxUnchecked width={size} height={size} />
      )}
    </TouchableOpacity>
  );
}
