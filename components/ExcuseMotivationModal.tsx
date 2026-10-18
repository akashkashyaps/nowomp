import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MessageSquare, X } from 'lucide-react-native';

import { colors, fonts } from '@/constants/theme';
interface MotivationalMessage {
  title: string;
  message: string;
}

interface ExcuseMotivationModalProps {
  visible: boolean;
  message: MotivationalMessage;
  onKeepExcuse: () => void;
  onGoToGym: () => void;
  onClose: () => void;
}

export default function ExcuseMotivationModal({
  visible,
  message,
  onKeepExcuse,
  onGoToGym,
  onClose
}: ExcuseMotivationModalProps) {
  const handleKeepExcuse = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onKeepExcuse();
  };

  const handleGoToGym = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onGoToGym();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <MessageSquare size={24} color={colors.danger} strokeWidth={2.5} />
              <Text style={styles.title}>HOLD ON A MINUTE</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
            >
              <X size={24} color={colors.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Before you give up, let&apos;s have a talk...
          </Text>

          <View style={styles.messageContainer}>
            <View style={styles.messageContent}>
              <Text style={styles.messageText}>{message.message}</Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.keepExcuseButton]}
              onPress={handleKeepExcuse}
            >
              <Text style={styles.keepExcuseButtonText}>KEEP EXCUSE</Text>
              <Text style={styles.buttonSubtext}>I&apos;m still not going</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.goToGymButton]}
              onPress={handleGoToGym}
            >
              <Text style={styles.goToGymButtonText}>GO TO GYM</Text>
              <Text style={styles.buttonSubtext}>You convinced me!</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              💪 Your future self is watching this decision
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 450,
    maxHeight: '80%',
    borderWidth: 2,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.danger,
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  messageContainer: {
    marginBottom: 24,
    minHeight: 150,
  },
  messageContent: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.accent,
    minHeight: 120,
  },
  messageTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 16,
  },
  messageText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    textAlign: 'left',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  keepExcuseButton: {
    backgroundColor: colors.card,
    borderColor: colors.danger,
  },
  goToGymButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  keepExcuseButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 4,
  },
  goToGymButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    textAlign: 'center',
    marginBottom: 4,
  },
  buttonSubtext: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});