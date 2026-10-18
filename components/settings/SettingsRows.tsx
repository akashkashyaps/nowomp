import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronRight } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';

/** A titled card of rows, the building block of Settings. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * One row: icon, label, an optional value on the right, and a chevron when
 * it opens something. Rows after the first in a group get a divider.
 */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  first,
  chevron = true,
  danger,
  activeOpacity,
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  first?: boolean;
  chevron?: boolean;
  danger?: boolean;
  activeOpacity?: number;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !first && styles.divider]}
      disabled={!onPress}
      activeOpacity={activeOpacity}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.label, danger && { color: colors.danger }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && chevron ? <ChevronRight size={18} color={colors.textFaint} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  groupTitle: { fontFamily: fonts.heading, fontSize: 13, color: colors.textDim, letterSpacing: 1, marginLeft: 4 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, minHeight: 56 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  icon: { width: 22, alignItems: 'center' },
  label: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  value: { maxWidth: '45%', fontFamily: fonts.body, fontSize: 13, color: colors.textDim },
});
