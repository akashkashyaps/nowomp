import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ClipboardCopy, Check, ChevronDown, ChevronUp, Share2 } from 'lucide-react-native';
import { colors, fonts } from '@/constants/theme';
import { HealthContextService } from '@/services/HealthContextService';
import { DailyJournalService } from '@/services/DailyJournalService';

/**
 * Generates a copyable analysis prompt from the user's current data.
 *
 * Deliberately not an in-app AI: the user takes this to whichever assistant
 * they prefer. The prompt is self-contained — values, personal baselines, and
 * how each score was derived — so the assistant needs no follow-up questions.
 */
/** How much of the prompt to show inline. The full text is what gets copied. */
const PREVIEW_CHARS = 1200;

interface AnalysisPromptCardProps {
  /** Bump to re-read the journal count after an entry is saved. */
  refreshKey?: number;
}

export function AnalysisPromptCard({ refreshKey = 0 }: AnalysisPromptCardProps) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [journalDays, setJournalDays] = useState(0);

  useEffect(() => {
    DailyJournalService.getLoggedDayCount().then(setJournalDays).catch(() => {});
  }, [refreshKey]);

  /**
   * Always rebuilds rather than caching: the journal may have been edited since
   * the last copy, and a stale prompt would silently omit it.
   */
  const ensurePrompt = async (): Promise<string | null> => {
    setLoading(true);
    try {
      const built = await HealthContextService.buildAnalysisPrompt();
      setPrompt(built);
      return built;
    } catch {
      Alert.alert('Error', 'Could not build the prompt from your data.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const text = await ensurePrompt();
    if (!text) return;
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const text = await ensurePrompt();
    if (!text) return;
    try {
      await Share.share({ message: text });
    } catch {
      // User dismissed the sheet.
    }
  };

  const handleToggle = async () => {
    if (!expanded) await ensurePrompt();
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>DAILY ANALYSIS PROMPT</Text>
      <Text style={styles.body}>
        Copy this and paste it into any AI assistant for a full analysis of your day.
        It includes today’s numbers, your personal baselines, recent history and how
        each score was calculated.
      </Text>

      <Text style={styles.tip}>
        {journalDays > 0
          ? `Includes ${journalDays} day${journalDays === 1 ? '' : 's'} of your journal, so the analysis can explain your numbers rather than assume.`
          : 'Fill in the journal above and it gets added here — that is what lets an AI explain why your numbers moved instead of guessing.'}
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabled]}
          onPress={handleCopy}
          disabled={loading}
        >
          {copied ? (
            <Check size={16} color={colors.bg} strokeWidth={2.5} />
          ) : (
            <ClipboardCopy size={16} color={colors.bg} strokeWidth={2.5} />
          )}
          <Text style={styles.primaryButtonText}>
            {loading ? 'BUILDING...' : copied ? 'COPIED' : 'COPY PROMPT'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, loading && styles.disabled]}
          onPress={handleShare}
          disabled={loading}
        >
          <Share2 size={16} color={colors.textMuted} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.toggle} onPress={handleToggle}>
        <Text style={styles.toggleText}>
          {expanded ? 'HIDE PREVIEW' : 'PREVIEW PROMPT'}
        </Text>
        {expanded ? (
          <ChevronUp size={14} color={colors.textFaint} strokeWidth={2.5} />
        ) : (
          <ChevronDown size={14} color={colors.textFaint} strokeWidth={2.5} />
        )}
      </TouchableOpacity>

      {/* Plain View, not a nested ScrollView: a scroll container inside the
          screen's own ScrollView fights it for touch handling on Android and
          locks the UI thread. The text is truncated instead, since this is a
          confidence check before copying rather than something to read here. */}
      {expanded && prompt && (
        <View style={styles.preview}>
          <Text style={styles.previewText}>
            {prompt.length > PREVIEW_CHARS
              ? `${prompt.slice(0, PREVIEW_CHARS)}\n\n… ${(
                  prompt.length - PREVIEW_CHARS
                ).toLocaleString()} more characters`
              : prompt}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 18,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.text,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  tip: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.cyan,
    lineHeight: 16,
    marginBottom: 16,
    marginTop: -6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    color: colors.bg,
    letterSpacing: 0.5,
  },
  iconButton: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.5,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  toggleText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  preview: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
  },
  previewText: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 15,
  },
});
