import {formatTopUpLabel} from '@application/plan/formatPlanNumbers';
import {TouchableOpacity} from '@components/ui';
import type {PhotoTopUpPackage} from '@domain/plan';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import IconChevronDown from '../../assets/images/icon_chevron_down.svg';

type TopUpPickerProps = {
  packages: PhotoTopUpPackage[];
  onTopUp: (pkg: PhotoTopUpPackage) => void;
};

export function TopUpPicker({packages, onTopUp}: TopUpPickerProps) {
  const [selectedId, setSelectedId] = useState(packages[0]?.id ?? '');
  const [menuOpen, setMenuOpen] = useState(false);

  const selected =
    packages.find(pkg => pkg.id === selectedId) ?? packages[0] ?? null;

  if (!selected) {
    return null;
  }

  return (
    <View style={styles.row}>
      <View style={styles.dropdownWrap}>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setMenuOpen(open => !open)}
          activeOpacity={0.8}>
          <Text style={styles.dropdownText} numberOfLines={1}>
            {formatTopUpLabel(selected.photoAmount, selected.priceUsd)}
          </Text>
          <IconChevronDown width={20} height={20} color={colors.textDark} />
        </TouchableOpacity>

        {menuOpen ? (
          <View style={styles.menu}>
            {packages.map(pkg => (
              <Pressable
                key={pkg.id}
                style={styles.menuItem}
                onPress={() => {
                  setSelectedId(pkg.id);
                  setMenuOpen(false);
                }}>
                <Text style={styles.menuItemText}>
                  {formatTopUpLabel(pkg.photoAmount, pkg.priceUsd)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.topUpButton}
        onPress={() => onTopUp(selected)}
        activeOpacity={0.8}>
        <Text style={styles.topUpText}>Top up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  dropdownWrap: {
    flex: 1,
    position: 'relative',
    zIndex: 20,
    marginRight: 16,
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.cardBackground,
  },
  dropdownText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textDark,
    marginRight: 8,
  },
  // Open upward — modal card uses overflow:hidden and clips downward menus.
  menu: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    backgroundColor: colors.cardBackground,
    overflow: 'hidden',
    zIndex: 30,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
  },
  topUpButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topUpText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.accent,
  },
});
