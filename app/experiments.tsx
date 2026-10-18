import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Clipboard from '@react-native-clipboard/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp, ChevronRight, X } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { experimentEmoji, VERDICT_LABELS } from '@/components/ExperimentCard';
import {
  ExperimentService,
  type Experiment,
  type LibraryEntry,
  type NewExperimentInput,
} from '@/services/ExperimentService';
import {
  CATEGORY_TITLES,
  CUSTOM_TEMPLATE_ID,
  METRICS,
  METRIC_ORDER,
  type ExperimentCategory,
  type MetricId,
} from '@/constants/experiments';
import { colors, fonts } from '@/constants/theme';
import {
  buildDesignPrompt,
  fromRouteParams,
  parseExperimentText,
  type ImportedExperiment,
} from '@/services/ExperimentAIBridge';

const CATEGORIES: ExperimentCategory[] = ['sleep', 'training', 'activity'];

export default function ExperimentsScreen() {
  const insets = useSafeAreaInsets();
  const [library, setLibrary] = useState<{ suggested: LibraryEntry[]; all: LibraryEntry[] } | null>(null);
  const [active, setActive] = useState<Experiment | null>(null);
  const [history, setHistory] = useState<Experiment[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [starting, setStarting] = useState(false);
  // Filled when an AI-designed experiment arrives via a nowomp://experiments link.
  const [imported, setImported] = useState<ImportedExperiment | null>(null);
  const params = useLocalSearchParams<Record<string, string>>();

  useEffect(() => {
    const fromLink = fromRouteParams(params);
    if (fromLink) {
      setImported(fromLink);
      setShowCustom(true);
    }
    // Only when the link's contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.title, params.rule, params.primary]);

  const copyDesignPrompt = async () => {
    const available = await ExperimentService.getAvailableMetrics();
    Clipboard.setString(buildDesignPrompt(available, library?.all ?? []));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Prompt copied',
      'Paste it into ChatGPT, Claude or any AI. When it replies with a nowomp:// link, tap it. Or copy its reply and use PASTE FROM AI in "Design your own".'
    );
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [lib, act, hist] = await Promise.all([
            ExperimentService.getLibrary(),
            ExperimentService.getActive(),
            ExperimentService.getHistory(),
          ]);
          setLibrary(lib);
          setActive(act);
          setHistory(hist);
        } catch (error) {
          console.error('Error loading experiment library:', error);
          setLibrary({ suggested: [], all: [] });
        }
      })();
    }, [])
  );

  const start = (input: NewExperimentInput) => {
    if (active) {
      Alert.alert(
        'One at a time',
        `"${active.title}" is still running. Running two at once makes it impossible to tell which one did what.`
      );
      return;
    }
    Alert.alert(
      `Start "${input.title}"?`,
      'It starts tomorrow and runs for 4 weeks. The app randomly picks whether week 1 is rule on or rule off.\n\nYour main measure is locked in now and can’t be changed. Results unlock when it ends. No peeking.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setStarting(true);
            try {
              const exp = await ExperimentService.start(input);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setShowCustom(false);
              router.replace({ pathname: '/experiment/[id]', params: { id: String(exp.id) } });
            } catch (error) {
              Alert.alert('Error', (error as Error).message);
            } finally {
              setStarting(false);
            }
          },
        },
      ]
    );
  };

  const renderEntry = (entry: LibraryEntry, showReason: boolean) => {
    const t = entry.template;
    const open = expanded === t.id;
    return (
      <View key={t.id} style={[styles.entry, !entry.available && styles.entryDisabled]}>
        <TouchableOpacity
          style={styles.entryHead}
          onPress={() => setExpanded(open ? null : t.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.entryEmoji}>{t.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryTitle}>{t.title}</Text>
            <Text style={styles.entrySub} numberOfLines={2}>
              {!entry.available
                ? entry.missing
                : showReason && entry.suggestion
                  ? entry.suggestion.reason
                  : `Measures ${METRICS[t.primary].label.toLowerCase()}`}
            </Text>
          </View>
          {open ? <ChevronUp size={18} color={colors.textDim} /> : <ChevronDown size={18} color={colors.textDim} />}
        </TouchableOpacity>

        {open && (
          <View style={styles.entryBody}>
            <Text style={styles.hypothesis}>“{t.hypothesis}”</Text>
            <View style={styles.ruleBox}>
              <Text style={styles.ruleOnLabel}>RULE ON WEEKS</Text>
              <Text style={styles.ruleText}>{t.rule}</Text>
            </View>
            <View style={[styles.ruleBox, styles.ruleBoxOff]}>
              <Text style={styles.ruleOffLabel}>RULE OFF WEEKS</Text>
              <Text style={styles.ruleText}>{t.offRule}</Text>
            </View>
            <Text style={styles.measureLabel}>MAIN MEASURE</Text>
            <Text style={styles.measure}>{METRICS[t.primary].label}</Text>
            {t.secondary.length > 0 && (
              <>
                <Text style={styles.measureLabel}>ALSO TRACKED</Text>
                <Text style={styles.measure}>{t.secondary.map((m) => METRICS[m].label).join(' · ')}</Text>
              </>
            )}
            {t.note && <Text style={styles.note}>📝 {t.note}</Text>}
            <TouchableOpacity
              style={[styles.startBtn, (!entry.available || starting) && { opacity: 0.4 }]}
              disabled={!entry.available || starting}
              onPress={() =>
                start({
                  templateId: t.id,
                  title: t.title,
                  rule: t.rule,
                  offRule: t.offRule,
                  hypothesis: t.hypothesis,
                  primary: t.primary,
                  secondary: t.secondary,
                })
              }
            >
              <Text style={styles.startBtnText}>
                {entry.available ? 'START EXPERIMENT' : entry.missing?.toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="EXPERIMENTS" subtitle="4 WEEKS · ON / OFF / ON / OFF" />

      {!library ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {active && (
            <TouchableOpacity
              style={styles.activeBanner}
              onPress={() => router.push({ pathname: '/experiment/[id]', params: { id: String(active.id) } })}
            >
              <Text style={styles.activeText}>
                {experimentEmoji(active)} Running: {active.title}
              </Text>
              <ChevronRight size={16} color={colors.bg} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.how} onPress={() => setShowHow((s) => !s)} activeOpacity={0.8}>
            <View style={styles.howHead}>
              <Text style={styles.howTitle}>🔬 HOW THE SCIENCE WORKS</Text>
              {showHow ? <ChevronUp size={16} color={colors.textDim} /> : <ChevronDown size={16} color={colors.textDim} />}
            </View>
            {showHow && (
              <View style={styles.howBody}>
                <Text style={styles.howItem}>• <Text style={styles.howBold}>ABAB design.</Text> Four 1-week blocks alternating rule on and rule off. The order is randomised, so “I was getting better anyway” can’t pass as an effect.</Text>
                <Text style={styles.howItem}>• <Text style={styles.howBold}>Pre-registered.</Text> You pick one main measure before starting. It’s locked, so you can’t cherry-pick whatever happened to improve.</Text>
                <Text style={styles.howItem}>• <Text style={styles.howBold}>Daily check-in.</Text> Only days you followed the plan count. Under 70% and the result is marked unreliable.</Text>
                <Text style={styles.howItem}>• <Text style={styles.howBold}>Beats your own noise.</Text> A change only counts if it’s bigger than your normal day-to-day variation and shows up in both rule-on weeks.</Text>
                <Text style={styles.howItem}>• <Text style={styles.howBold}>No peeking.</Text> Results unlock when the 4 weeks are over.</Text>
                <Text style={styles.howItem}>• <Text style={styles.howBold}>Honest limits.</Text> You know which week you’re in, so there’s no blinding. A result means “works for you”, not proof for everyone.</Text>
              </View>
            )}
          </TouchableOpacity>

          {library.suggested.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>SUGGESTED FOR YOU</Text>
              {library.suggested.map((e) => renderEntry(e, true))}
            </>
          )}

          {CATEGORIES.map((c) => (
            <View key={c}>
              <Text style={styles.sectionTitle}>{CATEGORY_TITLES[c]}</Text>
              {library.all.filter((e) => e.template.category === c).map((e) => renderEntry(e, false))}
            </View>
          ))}

          <Text style={styles.sectionTitle}>YOUR OWN</Text>
          <TouchableOpacity style={styles.customBtn} onPress={() => setShowCustom(true)}>
            <Text style={styles.customTitle}>✏️ Design your own experiment</Text>
            <Text style={styles.customSub}>Any rule you like, measured with your own data.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.customBtn, { marginTop: 8 }]} onPress={copyDesignPrompt}>
            <Text style={styles.customTitle}>🤖 Design one with AI</Text>
            <Text style={styles.customSub}>
              Copies a prompt for ChatGPT or Claude with what the app can measure. Nothing leaves your phone unless you
              paste it.
            </Text>
          </TouchableOpacity>

          {history.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>PAST EXPERIMENTS</Text>
              {history.map((e) => {
                const v = e.status === 'abandoned' ? null : e.result ? VERDICT_LABELS[e.result.primary.verdict] : null;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.historyRow}
                    onPress={() => router.push({ pathname: '/experiment/[id]', params: { id: String(e.id) } })}
                  >
                    <Text style={styles.entryEmoji}>{experimentEmoji(e)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={[styles.entrySub, v && { color: v.color }]}>
                        {e.status === 'abandoned' ? '🐀 Abandoned' : v ? `${v.icon} ${v.label}` : 'Completed'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textDim} />
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      <CustomExperimentModal
        visible={showCustom}
        initial={imported}
        onClose={() => {
          setShowCustom(false);
          setImported(null);
        }}
        onStart={start}
      />
    </View>
  );
}

function CustomExperimentModal({
  visible,
  initial,
  onClose,
  onStart,
}: {
  visible: boolean;
  initial?: ImportedExperiment | null;
  onClose: () => void;
  onStart: (input: NewExperimentInput) => void;
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [rule, setRule] = useState('');
  const [offRule, setOffRule] = useState('Live as you normally would.');
  const [primary, setPrimary] = useState<MetricId | null>(null);
  const [secondary, setSecondary] = useState<MetricId[]>([]);
  // An AI-designed experiment brings its own hypothesis; otherwise it's derived.
  const [hypothesis, setHypothesis] = useState<string | null>(null);
  const [available, setAvailable] = useState<Record<MetricId, boolean> | null>(null);

  const fill = (e: ImportedExperiment) => {
    setTitle(e.title);
    setRule(e.rule);
    setOffRule(e.offRule);
    setPrimary(e.primary);
    setSecondary(e.secondary);
    setHypothesis(e.hypothesis);
  };

  const onShow = () => {
    ExperimentService.getAvailableMetrics().then(setAvailable).catch(() => {});
    if (initial) fill(initial);
  };

  const pasteFromAI = async () => {
    const parsed = parseExperimentText(await Clipboard.getString());
    if (parsed) {
      fill(parsed);
      Haptics.selectionAsync();
    } else {
      Alert.alert(
        'Nothing to paste',
        "Copy the AI's whole reply (the nowomp:// link or the JSON) first, then tap PASTE FROM AI again."
      );
    }
  };

  const toggleSecondary = (m: MetricId) =>
    setSecondary((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const ready = title.trim().length > 1 && rule.trim().length > 3 && primary != null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalHead, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.modalTitle}>DESIGN YOUR OWN</Text>
          <TouchableOpacity onPress={pasteFromAI} style={styles.pasteBtn}>
            <Text style={styles.pasteText}>PASTE FROM AI</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          <Text style={styles.fieldLabel}>NAME</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Cold showers"
            placeholderTextColor={colors.textFaint}
            maxLength={40}
          />
          <Text style={styles.fieldLabel}>RULE ON WEEKS</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={rule}
            onChangeText={setRule}
            placeholder="e.g. 2-minute cold shower every morning"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={160}
          />
          <Text style={styles.fieldLabel}>RULE OFF WEEKS</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={offRule}
            onChangeText={setOffRule}
            multiline
            maxLength={160}
          />

          <Text style={styles.fieldLabel}>MAIN MEASURE (LOCKED ONCE STARTED)</Text>
          <View style={styles.chips}>
            {METRIC_ORDER.map((m) => {
              const ok = available?.[m] ?? false;
              return (
                <TouchableOpacity
                  key={m}
                  disabled={!ok}
                  onPress={() => {
                    setPrimary(m);
                    setSecondary((s) => s.filter((x) => x !== m));
                  }}
                  style={[styles.chip, primary === m && styles.chipOn, !ok && styles.chipDisabled]}
                >
                  <Text style={[styles.chipText, primary === m && styles.chipTextOn]}>{METRICS[m].label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.fieldHint}>Greyed out = not enough recent data for that measure.</Text>

          <Text style={styles.fieldLabel}>ALSO TRACK (OPTIONAL)</Text>
          <View style={styles.chips}>
            {METRIC_ORDER.filter((m) => m !== primary).map((m) => {
              const ok = available?.[m] ?? false;
              const on = secondary.includes(m);
              return (
                <TouchableOpacity
                  key={m}
                  disabled={!ok}
                  onPress={() => toggleSecondary(m)}
                  style={[styles.chip, on && styles.chipOnSecondary, !ok && styles.chipDisabled]}
                >
                  <Text style={styles.chipText}>{METRICS[m].label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.startBtn, { marginTop: 24 }, !ready && { opacity: 0.4 }]}
            disabled={!ready}
            onPress={() =>
              primary &&
              onStart({
                templateId: CUSTOM_TEMPLATE_ID,
                title: title.trim(),
                rule: rule.trim(),
                offRule: offRule.trim() || 'Live as you normally would.',
                hypothesis:
                  hypothesis ?? `${rule.trim().replace(/\.$/, '')} improves ${METRICS[primary].label.toLowerCase()}.`,
                primary,
                secondary,
              })
            }
          >
            <Text style={styles.startBtnText}>START EXPERIMENT</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.accent,
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 4,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  activeText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bg, flex: 1 },
  how: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  howHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  howTitle: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.text },
  howBody: { marginTop: 10, gap: 8 },
  howItem: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  howBold: { fontFamily: fonts.bodyBold, color: colors.text },
  entry: {
    backgroundColor: colors.card,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  entryDisabled: { opacity: 0.55 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  entryEmoji: { fontSize: 24 },
  entryTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  entrySub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  entryBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  hypothesis: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, fontStyle: 'italic' },
  ruleBox: { backgroundColor: 'rgba(168, 255, 62, 0.12)', borderRadius: 10, padding: 10 },
  ruleBoxOff: { backgroundColor: '#242424' },
  ruleOnLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, color: colors.accent, marginBottom: 2 },
  ruleOffLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, color: colors.textMuted, marginBottom: 2 },
  ruleText: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 18 },
  measureLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, color: colors.textDim, marginTop: 4 },
  measure: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.warn, marginTop: 4 },
  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  startBtnText: { fontFamily: fonts.heading, fontSize: 16, color: colors.bg },
  customBtn: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  customTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  customSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  pasteBtn: {
    marginLeft: 'auto',
    marginRight: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pasteText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.accent },
  modalTitle: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  fieldLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textDim,
    marginTop: 18,
    marginBottom: 8,
  },
  fieldHint: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 6 },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipOnSecondary: { borderColor: colors.accent },
  chipDisabled: { opacity: 0.3 },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.bg },
});
