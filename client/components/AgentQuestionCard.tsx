import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type PressableStateCallbackType, type TextStyle, type ViewStyle } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { AgentPermissionRequest, AgentPermissionResponse } from "@getpaseo/protocol/agent-types";
import { PaseoAssistantMessage } from "./PaseoAssistantMessage";

interface QuestionOption { label: string; description?: string }
interface QuestionFormQuestion {
  question: string; header: string; options: QuestionOption[]; multiSelect: boolean;
  allowOther: boolean; allowEmpty: boolean; placeholder?: string; dismissLabel?: string;
}
type Selections = Record<number, ReadonlySet<number>>;
type OtherTexts = Record<number, string>;

function parseQuestions(input: unknown): QuestionFormQuestion[] | null {
  if (typeof input !== "object" || input === null || !("questions" in input) || !Array.isArray((input as Record<string, unknown>).questions)) return null;
  const questions: QuestionFormQuestion[] = [];
  for (const raw of (input as Record<string, unknown>).questions as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const question = raw as Record<string, unknown>;
    if (typeof question.question !== "string" || typeof question.header !== "string" || !Array.isArray(question.options)) return null;
    const options: QuestionOption[] = [];
    for (const rawOption of question.options) {
      if (typeof rawOption !== "object" || rawOption === null || typeof (rawOption as Record<string, unknown>).label !== "string") return null;
      const option = rawOption as Record<string, unknown>;
      options.push({ label: option.label as string, description: typeof option.description === "string" ? option.description : undefined });
    }
    questions.push({
      question: question.question, header: question.header, options,
      multiSelect: question.multiSelect === true,
      allowOther: question.allowOther === true || question.isOther === true,
      allowEmpty: question.allowEmpty === true,
      placeholder: typeof question.placeholder === "string" ? question.placeholder : undefined,
      dismissLabel: typeof question.dismissLabel === "string" ? question.dismissLabel : undefined,
    });
  }
  return questions.length > 0 ? questions : null;
}

function showsTextInput(question: QuestionFormQuestion): boolean { return question.options.length === 0 || question.allowOther; }
function isAnswered(question: QuestionFormQuestion, index: number, selections: Selections, otherTexts: OtherTexts): boolean {
  if (selections[index]?.size) return true;
  if (!showsTextInput(question)) return false;
  return Boolean(otherTexts[index]?.trim()) || question.allowEmpty;
}
function buildAnswers(questions: QuestionFormQuestion[], selections: Selections, otherTexts: OtherTexts): Record<string, string> {
  const answers: Record<string, string> = {};
  questions.forEach((question, index) => {
    const otherText = otherTexts[index]?.trim();
    if (showsTextInput(question) && otherText) answers[question.header] = otherText;
    else if (question.allowEmpty && question.options.length === 0) answers[question.header] = "";
    else if (selections[index]?.size) answers[question.header] = Array.from(selections[index]).map((optionIndex) => question.options[optionIndex].label).join(", ");
  });
  return answers;
}

function QuestionFormCard({ request, theme, compact, responding, onRespond }: {
  request: AgentPermissionRequest; theme: PluginSurfaceProps["theme"]; compact: boolean; responding: boolean;
  onRespond: (response: AgentPermissionResponse) => void;
}) {
  const questions = useMemo(() => parseQuestions(request.input), [request.input]);
  const [selections, setSelections] = useState<Record<number, Set<number>>>({});
  const [otherTexts, setOtherTexts] = useState<Record<number, string>>({});
  const [respondingAction, setRespondingAction] = useState<"submit" | "dismiss" | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const borderAccent = (theme.colors as typeof theme.colors & { borderAccent?: string }).borderAccent ?? theme.colors.border;

  const toggleOption = useCallback((questionIndex: number, optionIndex: number, multiSelect: boolean) => {
    const current = selections[questionIndex] ?? new Set<number>();
    const next = new Set(current);
    if (multiSelect) { if (next.has(optionIndex)) next.delete(optionIndex); else next.add(optionIndex); }
    else if (next.has(optionIndex)) next.clear();
    else { next.clear(); next.add(optionIndex); }
    setSelections((previous) => ({ ...previous, [questionIndex]: next }));
    setOtherTexts((previous) => { if (!previous[questionIndex]) return previous; const nextTexts = { ...previous }; delete nextTexts[questionIndex]; return nextTexts; });
    if (!multiSelect && next.size > 0 && questionIndex === activeIndex && questions) setActiveIndex(Math.min(questionIndex + 1, questions.length - 1));
  }, [activeIndex, questions, selections]);
  const setOtherText = useCallback((questionIndex: number, text: string) => {
    setOtherTexts((previous) => ({ ...previous, [questionIndex]: text }));
    if (text.length > 0) setSelections((previous) => previous[questionIndex]?.size ? { ...previous, [questionIndex]: new Set<number>() } : previous);
  }, []);

  if (!questions) return null;
  const resolvedIndex = Math.min(activeIndex, questions.length - 1);
  const activeQuestion = questions[resolvedIndex];
  const activeAnswered = isAnswered(activeQuestion, resolvedIndex, selections, otherTexts);
  const allAnswered = questions.every((question, index) => isAnswered(question, index, selections, otherTexts));
  const isLastQuestion = resolvedIndex === questions.length - 1;
  const primaryDisabled = responding || (isLastQuestion ? !allAnswered : !activeAnswered);
  const selected = selections[resolvedIndex] ?? new Set<number>();
  const submit = () => {
    if (!allAnswered || responding) return;
    setRespondingAction("submit");
    onRespond({ behavior: "allow", updatedInput: { ...request.input, answers: buildAnswers(questions, selections, otherTexts) } });
  };
  const primaryAction = () => {
    if (!isLastQuestion) { if (activeAnswered && !responding) setActiveIndex((index) => Math.min(index + 1, questions.length - 1)); return; }
    submit();
  };
  const dismissLabel = questions.find((question) => question.dismissLabel)?.dismissLabel ?? "关闭";
  const dismiss = () => {
    setRespondingAction("dismiss");
    if (questions.every((question) => question.allowEmpty && question.options.length === 0)) onRespond({ behavior: "allow", updatedInput: { ...request.input, answers: buildAnswers(questions, selections, otherTexts) } });
    else onRespond({ behavior: "deny", message: "Dismissed by user" });
  };

  return <View style={styles.container} testID="question-form-card">
    {questions.length > 1 ? <View style={styles.questionNav} accessibilityRole="tablist" testID="question-form-question-nav">
      {questions.map((question, index) => {
        const active = index === resolvedIndex;
        return <Pressable key={question.header} accessibilityRole="tab" accessibilityLabel={`Question ${index + 1} of ${questions.length}`} accessibilityState={{ selected: active }} disabled={responding} onPress={() => setActiveIndex(index)} style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [styles.questionNavButton, { backgroundColor: active || hovered ? theme.colors.surface2 : theme.colors.surface1, borderColor: active ? theme.colors.foregroundMuted : theme.colors.border }, pressed && styles.pressed]}>
          {isAnswered(question, index, selections, otherTexts) ? <Icon name="Check" size={12} color={active ? theme.colors.foreground : theme.colors.foregroundMuted} /> : null}
          <Text numberOfLines={1} style={[styles.questionNavText, { color: active ? theme.colors.foreground : theme.colors.foregroundMuted }]}>{question.header}</Text>
        </Pressable>;
      })}
    </View> : null}
    <View style={styles.questionHeader}><Text style={styles.questionText} testID="question-form-current-question">{activeQuestion.question}</Text></View>
    <View key={activeQuestion.question} style={styles.questionBlock}>
      {activeQuestion.options.length > 0 ? <View style={styles.optionsWrap} accessibilityRole={activeQuestion.multiSelect ? undefined : "radiogroup"} accessibilityLabel={activeQuestion.question}>
        {activeQuestion.options.map((option, optionIndex) => {
          const isSelected = selected.has(optionIndex);
          return <Pressable key={option.label} disabled={responding} accessibilityRole={activeQuestion.multiSelect ? "checkbox" : "radio"} accessibilityLabel={option.label} accessibilityState={{ checked: isSelected }} onPress={() => toggleOption(resolvedIndex, optionIndex, activeQuestion.multiSelect)} style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [styles.optionItem, (hovered || isSelected) && { backgroundColor: theme.colors.surface2 }, pressed && styles.pressed]}>
            <View style={styles.optionItemContent}>
              <View style={[styles.selectionControl, activeQuestion.multiSelect ? styles.checkbox : styles.radio, { borderColor: isSelected ? theme.colors.accent : theme.colors.foregroundMuted, backgroundColor: isSelected && activeQuestion.multiSelect ? theme.colors.accent : "transparent" }]}>
                {isSelected && activeQuestion.multiSelect ? <Icon name="Check" size={12} color={theme.colors.accentForeground} /> : null}
                {isSelected && !activeQuestion.multiSelect ? <View style={[styles.radioDot, { backgroundColor: theme.colors.accent }]} /> : null}
              </View>
              <View style={styles.optionTextBlock}><Text style={styles.optionLabel}>{option.label}</Text>{option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}</View>
            </View>
          </Pressable>;
        })}
      </View> : null}
      {showsTextInput(activeQuestion) ? <TextInput value={otherTexts[resolvedIndex] ?? ""} accessibilityLabel={activeQuestion.question} editable={!responding} blurOnSubmit={false} placeholder={activeQuestion.placeholder ?? (activeQuestion.options.length === 0 ? "输入你的回答..." : "其他...")} placeholderTextColor={theme.colors.foregroundMuted} onChangeText={(text) => setOtherText(resolvedIndex, text)} onSubmitEditing={primaryAction} style={[styles.otherInput, { borderColor: (otherTexts[resolvedIndex]?.length ?? 0) > 0 ? borderAccent : theme.colors.border }]} /> : null}
    </View>
    <View style={[styles.actionsContainer, !compact && styles.actionsContainerDesktop]}>
      <Pressable accessibilityRole="button" accessibilityLabel={dismissLabel} disabled={responding} onPress={dismiss} style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [styles.actionButton, { backgroundColor: hovered ? theme.colors.surface2 : theme.colors.surface1, borderColor: borderAccent }, pressed && styles.pressed]}>
        {respondingAction === "dismiss" ? <ActivityIndicator size="small" color={theme.colors.foregroundMuted} /> : <View style={styles.actionContent}><Icon name="X" size={14} color={theme.colors.foregroundMuted} /><Text style={[styles.actionText, { color: theme.colors.foregroundMuted }]}>{dismissLabel}</Text></View>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={isLastQuestion ? "提交" : "下一步"} disabled={primaryDisabled} onPress={primaryAction} style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent, opacity: primaryDisabled ? 0.5 : 1 }, pressed && !primaryDisabled && styles.pressed]}>
        {respondingAction === "submit" ? <ActivityIndicator size="small" color={theme.colors.accentForeground} /> : <View style={styles.actionContent}><Icon name="Check" size={14} color={theme.colors.accentForeground} /><Text style={[styles.actionText, { color: theme.colors.accentForeground }]}>{isLastQuestion ? "提交" : "下一步"}</Text></View>}
      </Pressable>
    </View>
  </View>;
}

function detailText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function AgentPermissionCard({ request, theme, compact, responding, onRespond }: {
  request: AgentPermissionRequest; theme: PluginSurfaceProps["theme"]; compact: boolean; responding: boolean;
  onRespond: (response: AgentPermissionResponse) => void;
}) {
  const [respondingActionId, setRespondingActionId] = useState<string | null>(null);
  const styles = useMemo(() => createPermissionStyles(theme), [theme]);
  const borderAccent = (theme.colors as typeof theme.colors & { borderAccent?: string }).borderAccent ?? theme.colors.border;
  if (request.kind === "question") return <QuestionFormCard request={request} theme={theme} compact={compact} responding={responding} onRespond={onRespond} />;

  const isPlan = request.kind === "plan";
  const planText = typeof request.metadata?.planText === "string" ? request.metadata.planText : typeof request.input?.plan === "string" ? request.input.plan : undefined;
  const title = isPlan ? "Plan" : (request.title ?? request.name ?? "需要权限");
  const actions = request.actions?.length ? request.actions : [
    { id: "reject", label: "拒绝", behavior: "deny" as const, variant: "danger" as const },
    { id: "accept", label: isPlan ? "实施" : "接受", behavior: "allow" as const, variant: "primary" as const },
  ];
  const detail = request.detail ?? { type: "unknown", input: request.input ?? null, output: null };
  const pressAction = (action: (typeof actions)[number]) => {
    setRespondingActionId(action.id);
    onRespond(action.behavior === "allow" ? { behavior: "allow", selectedActionId: action.id } : { behavior: "deny", selectedActionId: action.id, message: "Denied by user" });
  };
  const footer = <>
    <Text style={styles.question}>你想如何继续？</Text>
    <View style={[styles.optionsContainer, !compact && styles.optionsContainerDesktop]}>
      {actions.map((action) => {
        const primary = action.variant === "primary";
        return <Pressable key={action.id} accessibilityRole="button" disabled={responding} onPress={() => pressAction(action)} style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [styles.optionButton, { borderColor: borderAccent }, hovered && styles.optionButtonHovered, pressed && styles.pressed]}>
          {respondingActionId === action.id ? <ActivityIndicator size="small" color={primary ? theme.colors.foreground : theme.colors.foregroundMuted} /> : <View style={styles.optionContent}><Icon name={action.behavior === "allow" ? "Check" : "X"} size={14} color={primary ? theme.colors.foreground : theme.colors.foregroundMuted} /><Text style={[styles.optionText, primary && styles.optionTextPrimary]}>{action.label}</Text></View>}
        </Pressable>;
      })}
    </View>
  </>;

  return <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    {request.description ? <Text style={styles.description}>{request.description}</Text> : null}
    {planText ? <View style={styles.section}>{!isPlan ? <Text style={styles.sectionTitle}>建议计划</Text> : null}<PaseoAssistantMessage text={planText} theme={theme} /></View> : null}
    {!isPlan ? <ScrollView style={styles.detail} nestedScrollEnabled><Text selectable style={styles.detailText}>{detailText(detail)}</Text></ScrollView> : null}
    {footer}
  </View>;
}

function createStyles(theme: PluginSurfaceProps["theme"]) {
  return {
    container: { padding: 12, borderRadius: 8, borderWidth: 1, gap: 12, backgroundColor: theme.colors.surface1, borderColor: theme.colors.border } as ViewStyle,
    questionBlock: { gap: 8 } as ViewStyle,
    questionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 4, flex: 1 } as ViewStyle,
    questionText: { flex: 1, color: theme.colors.foreground, fontSize: 14, fontWeight: "500", lineHeight: 22 } as TextStyle,
    optionsWrap: { gap: 4 } as ViewStyle,
    questionNav: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, paddingHorizontal: 12 } as ViewStyle,
    questionNavButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 } as ViewStyle,
    questionNavText: { fontSize: 14, fontWeight: "500" } as TextStyle,
    optionItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 } as ViewStyle,
    pressed: { opacity: 0.9 } as ViewStyle,
    optionItemContent: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 } as ViewStyle,
    optionTextBlock: { flex: 1, gap: 4 } as ViewStyle,
    optionLabel: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600", lineHeight: 22 } as TextStyle,
    optionDescription: { color: theme.colors.foregroundMuted, fontSize: 14, lineHeight: 20 } as TextStyle,
    selectionControl: { width: 18, height: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, marginTop: 2 } as ViewStyle,
    checkbox: { borderRadius: 4 } as ViewStyle,
    radio: { borderRadius: 999 } as ViewStyle,
    radioDot: { width: 8, height: 8, borderRadius: 999 } as ViewStyle,
    otherInput: { borderWidth: 1, borderRadius: 8, borderColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: theme.colors.foreground, backgroundColor: theme.colors.surface2 } as TextStyle,
    actionsContainer: { gap: 8 } as ViewStyle,
    actionsContainerDesktop: { flexDirection: "row", justifyContent: "flex-start", alignItems: "center" } as ViewStyle,
    actionButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignItems: "center", borderWidth: 1 } as ViewStyle,
    actionContent: { flexDirection: "row", alignItems: "center", gap: 8 } as ViewStyle,
    actionText: { fontSize: 14 } as TextStyle,
  };
}

function createPermissionStyles(theme: PluginSurfaceProps["theme"]) {
  return {
    container: { marginVertical: 12, padding: 12, borderRadius: 8, borderWidth: 1, gap: 8, backgroundColor: theme.colors.surface1, borderColor: theme.colors.border } as ViewStyle,
    title: { fontSize: 14, lineHeight: 22, color: theme.colors.foreground } as TextStyle,
    description: { fontSize: 14, lineHeight: 20, color: theme.colors.foregroundMuted } as TextStyle,
    section: { gap: 8 } as ViewStyle,
    sectionTitle: { fontSize: 12, color: theme.colors.foregroundMuted } as TextStyle,
    question: { fontSize: 14, marginTop: 4, marginBottom: 4, color: theme.colors.foregroundMuted } as TextStyle,
    optionsContainer: { gap: 8 } as ViewStyle,
    optionsContainerDesktop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", alignItems: "center", width: "100%" } as ViewStyle,
    optionButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignItems: "center", borderWidth: 1, backgroundColor: theme.colors.surface1 } as ViewStyle,
    optionButtonHovered: { backgroundColor: theme.colors.surface2 } as ViewStyle,
    pressed: { opacity: 0.9 } as ViewStyle,
    optionContent: { flexDirection: "row", alignItems: "center", gap: 8 } as ViewStyle,
    optionText: { fontSize: 14, fontWeight: "normal", color: theme.colors.foregroundMuted } as TextStyle,
    optionTextPrimary: { color: theme.colors.foreground } as TextStyle,
    detail: { maxHeight: 200, borderRadius: 6, backgroundColor: theme.colors.surface2, padding: 10 } as ViewStyle,
    detailText: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18, fontFamily: "monospace" } as TextStyle,
  };
}
