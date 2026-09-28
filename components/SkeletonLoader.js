import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";

export function SkeletonBox({ width, height, borderRadius = 8, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return <Animated.View style={[styles.box, { width, height, borderRadius, opacity }, style]} />;
}

export function TripBannerSkeleton() {
  return (
    <View style={styles.bannerSkeleton}>
      <SkeletonBox width={32} height={32} borderRadius={16} />
      <View style={styles.bannerTextGroup}>
        <SkeletonBox width="70%" height={14} borderRadius={6} />
        <SkeletonBox width="50%" height={12} borderRadius={6} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function RequestCardSkeleton() {
  return (
    <View style={styles.cardSkeleton}>
      <View style={styles.rowSkeleton}>
        <SkeletonBox width={48} height={48} borderRadius={24} />
        <View style={styles.cardTextGroup}>
          <SkeletonBox width="55%" height={14} borderRadius={6} />
          <SkeletonBox width="35%" height={12} borderRadius={6} style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonBox width="100%" height={12} borderRadius={6} style={{ marginTop: 16 }} />
      <SkeletonBox width="80%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
      <View style={styles.actionRowSkeleton}>
        <SkeletonBox width="35%" height={48} borderRadius={12} />
        <SkeletonBox width="60%" height={48} borderRadius={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: "#E1E2ED" },
  bannerSkeleton: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#F3F3FE",
    borderRadius: 12, padding: 16, marginBottom: 12, gap: 12,
    borderWidth: 1, borderColor: "#E1E2ED",
  },
  bannerTextGroup: { flex: 1 },
  cardSkeleton: {
    backgroundColor: "#ffffff", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#E1E2ED", marginBottom: 16,
  },
  rowSkeleton: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTextGroup: { flex: 1 },
  actionRowSkeleton: { flexDirection: "row", gap: 12, marginTop: 16, justifyContent: "space-between" },
});
