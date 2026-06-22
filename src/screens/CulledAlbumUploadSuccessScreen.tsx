import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {TouchableOpacity} from '@components/ui';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconClose from '../assets/images/icon_close.svg';
import GumpLogo from '../assets/images/logo.svg';
import GumpLogoOnly from '../assets/images/logo_icon_only.svg';
import { useState } from 'react';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumUploadSuccess'>;

export default function CulledAlbumUploadSuccessScreen({
  navigation,
  route,
}: Props) {
  const {albumLink} = route.params;
  const [headerHeight, setHeaderHeight] = useState(0);

  function handleClose() {
    navigation.popToTop();
  }

  async function handleOpenAlbum() {
    if (albumLink) {
      try {
        await Linking.openURL(albumLink);
      } catch (error) {
        console.error('[CulledAlbumUploadSuccessScreen] Failed to open album', error);
      }
    }
    handleClose();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header} onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
        <GumpLogo width={112} height={40} />
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          activeOpacity={0.7}>
          <IconClose width={32} height={32} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={[styles.body, {paddingBottom: headerHeight}]}>
        <View style={styles.content}>
          <View style={styles.titleIconContainer}>
            <GumpLogoOnly width={48} height={48} />
            <View style={styles.infoContainer}>
              <Text style={styles.title}>Your Album is Ready</Text>
              <Text style={styles.subtitle}>Access your album in Gump.gg now.</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.openButton}
            onPress={handleOpenAlbum}
            activeOpacity={0.8}
            disabled={!albumLink}>
            <Text style={styles.openButtonText}>Open Album</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 24,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  content: {
    width: '100%',
    maxWidth: 430,
    gap: 32,
    alignItems: 'center',
  },
  titleIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  infoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    lineHeight: 32 * 1.2,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16 * 1.2,
    color: colors.text,
    textAlign: 'center',
  },
  openButton: {
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 40,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  openButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
});
