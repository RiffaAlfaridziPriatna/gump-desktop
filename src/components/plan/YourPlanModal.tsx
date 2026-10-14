import {
  formatPhotoCount,
  formatStorageGb,
} from '@application/plan/formatPlanNumbers';
import {Modal, TouchableOpacity} from '@components/ui';
import {PlanAlertBanner} from '@components/plan/PlanAlertBanner';
import {TopUpPicker} from '@components/plan/TopUpPicker';
import {UsageMeter, meterProgress} from '@components/plan/UsageMeter';
import type {PhotoTopUpPackage, UserPlanSnapshot} from '@domain/plan';
import {openPhotoTopUp, openUpgradePlan} from '@lib/plan/billingLinks';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';
import QuarterCircle from '../../assets/images/icon_quarter_circle.svg';

type YourPlanModalProps = {
  visible: boolean;
  snapshot: UserPlanSnapshot;
  onClose: () => void;
};

function ModalDecor() {
  return (
    <>
      <HalfCircle style={styles.halfCircleDecor} width={72} />
      <QuarterCircleOrange
        style={styles.quarterOrangeDecor}
        width={98}
        height={98}
      />
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
      <CircleLightBlue
        style={styles.circleLightBlueDecor}
        width={36}
        height={36}
      />
    </>
  );
}

export function YourPlanModal({
  visible,
  snapshot,
  onClose,
}: YourPlanModalProps) {
  const {plan, usage, topUpPackages, showTopUp} = snapshot;
  const photosLimit = usage.photos.limit ?? 0;
  const storageLimit = usage.storageGb.limit;
  const photoFillColor =
    usage.photoState === 'limit' ? colors.error : colors.accent;

  const photoValue =
    photosLimit > 0
      ? `${formatPhotoCount(usage.photos.used)} / ${formatPhotoCount(photosLimit)}`
      : formatPhotoCount(usage.photos.used);

  const storageValue =
    storageLimit != null
      ? `${formatStorageGb(usage.storageGb.used)} GB / ${formatStorageGb(storageLimit)} GB`
      : `${formatStorageGb(usage.storageGb.used)} GB`;

  const exportTitle =
    plan.exportQuality === 'original' ? 'Original JPG' : 'Compressed JPG';
  const exportFooter =
    plan.exportQuality === 'original'
      ? 'Full resolution exports, web-ready options available.'
      : 'Optimized for sharing; original quality on paid plans.';

  const alertVariant = !plan.isPaid ? 'free' : usage.photoState;
  const modalHeight =
    alertVariant === 'free'
      ? 640
      : alertVariant === 'warning' || alertVariant === 'limit'
        ? 800
        : 740;

  const [scrollEnabled, setScrollEnabled] = useState(false);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);

  const syncScrollEnabled = useCallback(() => {
    const viewportH = viewportHeightRef.current;
    const contentH = contentHeightRef.current;
    if (viewportH <= 0 || contentH <= 0) {
      setScrollEnabled(false);
      return;
    }
    setScrollEnabled(contentH > viewportH + 1);
  }, []);

  useEffect(() => {
    if (!visible) {
      viewportHeightRef.current = 0;
      contentHeightRef.current = 0;
      setScrollEnabled(false);
    }
  }, [visible]);

  async function handleUpgrade() {
    try {
      await openUpgradePlan();
    } catch (error) {
      console.error('[YourPlanModal] Failed to open upgrade', error);
    }
  }

  async function handleTopUp(pkg: PhotoTopUpPackage) {
    try {
      // TODO(backend): POST /photo-processing-plans/{planId}/checkout
      await openPhotoTopUp(pkg.id);
    } catch (error) {
      console.error('[YourPlanModal] Failed to open top up', error);
    }
  }

  const planIconColor = useMemo(() => {
    switch (plan.apiName) {
      case 'basic':
      case 'corp_free':
        return colors.accent;
      case 'lite':
      case 'corp_basic':
        return colors.red;
      case 'pro':
      case 'corp_premium':
        return colors.blue;
      case 'super':
        case 'corp_enterprise':
        return colors.yellow;
    }
  }, [plan.apiName]);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={720}
      height={modalHeight}
      contentStyle={styles.modalContent}>
      <ModalDecor />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onLayout={event => {
          viewportHeightRef.current = event.nativeEvent.layout.height;
          syncScrollEnabled();
        }}
        onContentSizeChange={(_width, height) => {
          contentHeightRef.current = height;
          syncScrollEnabled();
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}>
        <Text style={styles.title}>Your Plan</Text>

        <View style={styles.body}>
          <View style={styles.planCard}>
            <View style={styles.planInfo}>
              <View style={styles.planNameRow}>
                <View style={styles.planIconContainer}>
                  <QuarterCircle
                    width={16}
                    height={16}
                    color={planIconColor}
                  />
                </View>
                <Text style={styles.planName}>{plan.displayName}</Text>
              </View>
              <Text style={styles.planDescription}>{plan.description}</Text>
            </View>
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={handleUpgrade}
              activeOpacity={0.8}>
              <Text style={styles.upgradeText}>Upgrade Plan</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionCard}>
            <UsageMeter
              label="Photos processed"
              valueLabel={photoValue}
              progress={meterProgress(usage.photos.used, usage.photos.limit)}
              fillColor={photoFillColor}
              height={9}
            />
            {alertVariant !== 'normal' ? (
              <View style={styles.alertWrap}>
                <PlanAlertBanner variant={alertVariant} />
              </View>
            ) : null}
          </View>

          <View style={styles.statsRow}>
            <View
              style={[styles.sectionCard, styles.statCard, styles.statCardLeft]}>
              <UsageMeter
                label="Storage"
                valueLabel={storageValue}
                progress={meterProgress(
                  usage.storageGb.used,
                  usage.storageGb.limit,
                )}
                height={9}
                footer="Cloud photo & video storage"
                compact
              />
            </View>
            <View style={[styles.sectionCard, styles.statCard]}>
              <Text style={styles.sectionLabel}>Export</Text>
              <Text style={styles.exportTitle}>{exportTitle}</Text>
              <Text style={styles.exportFooter}>{exportFooter}</Text>
            </View>
          </View>

          {showTopUp ? (
            <View style={[styles.sectionCard, styles.topUpCard]}>
              <Text style={styles.sectionLabel}>
                Add more processing capacity
              </Text>
              <Text style={styles.topUpDescription}>
                Need to process more photos than your plan includes? Add extra
                capacity without changing your plan.
              </Text>
              <TopUpPicker packages={topUpPackages} onTopUp={handleTopUp} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    alignItems: 'stretch',
  },
  scroll: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 64,
    paddingHorizontal: 40,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: 24,
  },
  body: {
    width: 480,
    maxWidth: '100%',
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  planInfo: {
    flex: 1,
    marginRight: 8,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  planIconContainer: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
  planName: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.textDark,
  },
  planDescription: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: '#727272',
    maxWidth: 244,
  },
  upgradeButton: {
    backgroundColor: colors.accent,
    borderRadius: 24,
    paddingVertical: 7,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  alertWrap: {
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCard: {
    flex: 1,
  },
  statCardLeft: {
    marginRight: 12,
  },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textDark,
    marginBottom: 12,
  },
  exportTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: 8,
  },
  exportFooter: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: '#727272',
  },
  topUpDescription: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: '#727272',
    marginBottom: 16,
    marginTop: -4,
  },
  topUpCard: {
    zIndex: 10,
    marginBottom: 0,
  },
  halfCircleDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  quarterOrangeDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  quarterRedDecor: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  circleBlueDecor: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  circleLightBlueDecor: {
    position: 'absolute',
    top: 80,
    right: 0,
  },
});
