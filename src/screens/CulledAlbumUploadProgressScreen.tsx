import {ProgressBar} from '@components/ui';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {
  useCulledAlbumActions,
  useCulledAlbumServerUploadBatch,
} from '@context/culledAlbum';
import {
  computeServerUploadBatchProgress,
  countServerUploadBatchItems,
  isServerUploadBatchFinished,
} from '@lib/culledAlbum/serverUploadProgress';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useEffect, useState} from 'react';
import {useLayout} from '@hooks/useLayout';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
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
  const {shellProps, handleBack} = useUploadAwareModalScreen(
    navigation,
    route.params.instant,
    {albumId},
  );
  const {screenPaddingHorizontal, isMobileLayout} = useLayout();
  const {resumeInFlightWork} = useCulledAlbumActions();
  const {batchPhotoIds, photos} = useCulledAlbumServerUploadBatch(albumId);

  const progress = computeServerUploadBatchProgress(photos, batchPhotoIds);
  const finished = isServerUploadBatchFinished(photos, batchPhotoIds);
  const counts = countServerUploadBatchItems(photos, batchPhotoIds);
  const remainingCount = counts.pending + counts.inProgress;
  const totalCount = batchPhotoIds.length || photoCount;
  const title = finished
    ? `Uploaded ${counts.completed} Photo${counts.completed === 1 ? '' : 's'}`
    : `Uploading ${remainingCount || totalCount} Photo${
        (remainingCount || totalCount) === 1 ? '' : 's'
      }`;

  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    resumeInFlightWork(albumId);
  }, [albumId, resumeInFlightWork]);

  useEffect(() => {
    if (!finished) {
      return;
    }

    navigation.replace('CulledAlbumUploadSuccess', {
      albumId,
      albumLink,
      albumName,
    });
  }, [albumId, albumLink, albumName, finished, navigation]);

  return (
    <UploadAwareModalShell {...shellProps}>
      <SafeAreaView style={styles.container}>
        <View
          style={[
            styles.header,
            {paddingHorizontal: screenPaddingHorizontal},
            isMobileLayout && styles.headerMobile,
          ]}
          onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
          <GumpLogo width={112} height={40} />
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            activeOpacity={0.7}>
            <IconClose width={32} height={32} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.body,
            {
              paddingBottom: headerHeight,
              paddingHorizontal: screenPaddingHorizontal,
            },
          ]}>
          <View style={styles.content}>
            <View style={styles.infoContainer}>
              <Text style={styles.title}>{title}</Text>
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
          </View>
        </View>
      </SafeAreaView>
    </UploadAwareModalShell>
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
    paddingTop: 40,
    paddingBottom: 24,
  },
  headerMobile: {
    paddingTop: 16,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
});
