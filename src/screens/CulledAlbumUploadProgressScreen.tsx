import {ProgressBar} from '@components/ui';
import {useCulledAlbumServerUploadBatch} from '@context/culledAlbum';
import {
  computeServerUploadBatchProgress,
  isServerUploadBatchFinished,
  isServerUploadBatchSuccessful,
} from '@lib/culledAlbum/serverUploadProgress';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useEffect, useState} from 'react';
import {TouchableOpacity} from '@components/ui';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconClose from '../assets/images/icon_close.svg';
import GumpLogo from '../assets/images/logo.svg';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumUploadProgress'>;

export default function CulledAlbumUploadProgressScreen({
  navigation,
  route,
}: Props) {
  const {albumId, photoCount, albumName, albumLink} = route.params;
  const {batchPhotoIds, photos} = useCulledAlbumServerUploadBatch(albumId);

  const progress = computeServerUploadBatchProgress(photos, batchPhotoIds);
  const finished = isServerUploadBatchFinished(photos, batchPhotoIds);
  const successful = isServerUploadBatchSuccessful(photos, batchPhotoIds);
  const failedCount = photos.filter(
    photo => photo.serverUploadStatus === 'failed',
  ).length;

  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (!finished) {
      return;
    }

    if (successful) {
      navigation.replace('CulledAlbumUploadSuccess', {
        albumId,
        albumLink,
        albumName,
      });
    }
  }, [albumId, albumLink, albumName, finished, navigation, successful]);

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
          <View style={styles.infoContainer}>
            <Text style={styles.title}>Uploading {photoCount} Photos</Text>
            <Text style={styles.subtitle}>
              Your photos are being uploaded to your Gump album.{'\n'}
              Please keep this window open.
            </Text>
          </View>
          <ProgressBar
            progress={progress}
            height={8}
            trackColor={colors.border}
            fillColor={colors.accent}
            style={styles.progressBar}
          />
          {finished && failedCount > 0 && (
            <Text style={styles.errorText}>
              {failedCount} photo{failedCount === 1 ? '' : 's'} failed to upload.
              Close to return home.
            </Text>
          )}
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
  infoContainer: {
    gap: 16,
    alignItems: 'center',
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
    lineHeight: 16 * 1.5,
    color: colors.text,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.textGray,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
});
