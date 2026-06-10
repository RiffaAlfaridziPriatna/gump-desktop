import { colors } from '@lib/colors';
import { fonts } from '@lib/typography';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageCheckIcon from '../assets/images/image_check.svg';
import GumpLogo from '../assets/images/logo.svg';

export default function HomeScreen() {
  const [headerHeight, setHeaderHeight] = useState(0);

  const handleSelectAlbum = () => {
    // TODO: open system album picker
  };

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={styles.header}
        onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <GumpLogo width={112} height={40} />
      </View>

      <View style={styles.emptyState}>
        <View style={styles.content}>
          <Text style={styles.title}>Clean Up Your Photo Albums</Text>
          <Text style={styles.subtitle}>
            Select an existing album to start culling your photos.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.card}
          onPress={handleSelectAlbum}
          activeOpacity={0.7}
        >
          <ImageCheckIcon width={40} height={40} />
          <Text style={styles.cardLabel}>Select Existing Album</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: headerHeight }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 72,
    paddingTop: 60,
    paddingBottom: 32,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 40,
  },
  content: {
    gap: 16,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: 300,
    paddingVertical: 80,
    paddingHorizontal: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cardLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: colors.text,
  },
});
