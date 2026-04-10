import { PropsWithChildren, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./theme";

export function Screen({
  title,
  subtitle,
  scroll = true,
  children,
  right,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  scroll?: boolean;
  right?: ReactNode;
}>) {
  const content = (
    <>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </>
  );

  return (
    <LinearGradient
      colors={["#121933", "#1A2547", "#10182F"]}
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 0.9, y: 0.9 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.safeArea}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
        ) : (
          <View style={styles.scrollContent}>{content}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return (
    <BlurView intensity={24} tint="dark" style={[styles.card, style]}>
      {children}
    </BlurView>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function AppButton({
  label,
  onPress,
  variant = "default",
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "default" | "primary" | "danger" | "success";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tone =
    variant === "primary"
      ? styles.buttonPrimary
      : variant === "danger"
        ? styles.buttonDanger
        : variant === "success"
          ? styles.buttonSuccess
          : styles.buttonDefault;

  return (
    <Pressable
      style={[styles.button, tone, disabled && styles.buttonDisabled, style]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

export function AppInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  keyboardType,
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "numeric" | "email-address";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.45)"
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      style={[styles.input, multiline && styles.textarea, style]}
    />
  );
}

export function Field({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "danger" | "warning" | "info";
}) {
  const style =
    tone === "success"
      ? styles.badgeSuccess
      : tone === "danger"
        ? styles.badgeDanger
        : tone === "warning"
          ? styles.badgeWarning
          : tone === "info"
            ? styles.badgeInfo
            : styles.badgeDefault;

  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <Card>
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.text} />
        <Text style={styles.mutedText}>{label}</Text>
      </View>
    </Card>
  );
}

export function EmptyBlock({ label }: { label: string }) {
  return (
    <Card>
      <Text style={styles.mutedText}>{label}</Text>
    </Card>
  );
}

export function InlineLabel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.inlineLabel, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: theme.spacing.md, gap: theme.spacing.md },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: "700" },
  subtitle: { color: "rgba(255,255,255,0.7)", marginTop: 6, lineHeight: 20 },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.glass,
    padding: theme.spacing.md,
    overflow: "hidden",
    ...theme.shadow.card,
  },
  sectionTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "600", marginBottom: 8 },
  button: {
    minHeight: 44,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  buttonDefault: { backgroundColor: theme.colors.glass, borderColor: theme.colors.border },
  buttonPrimary: { backgroundColor: "rgba(14,3,219,0.28)", borderColor: theme.colors.border },
  buttonDanger: { backgroundColor: theme.colors.danger, borderColor: "rgba(255,99,132,0.35)" },
  buttonSuccess: { backgroundColor: theme.colors.success, borderColor: "rgba(52,211,153,0.35)" },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { color: theme.colors.text, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.glassStrong,
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  field: { gap: 8 },
  fieldLabel: { color: "rgba(255,255,255,0.68)", fontSize: 12, textTransform: "uppercase" },
  badge: { borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  badgeLabel: { color: theme.colors.text, fontSize: 12, fontWeight: "600" },
  badgeDefault: { backgroundColor: "rgba(255,255,255,0.12)" },
  badgeSuccess: { backgroundColor: theme.colors.success },
  badgeDanger: { backgroundColor: theme.colors.danger },
  badgeWarning: { backgroundColor: theme.colors.warning },
  badgeInfo: { backgroundColor: theme.colors.info },
  centered: { flexDirection: "row", alignItems: "center", gap: 10 },
  mutedText: { color: "rgba(255,255,255,0.68)", lineHeight: 20 },
  inlineLabel: { color: "rgba(255,255,255,0.62)" },
});
