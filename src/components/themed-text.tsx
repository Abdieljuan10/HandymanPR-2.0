import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    // Added in the 2026-09-25 design-system pass -- a real type scale for
    // "large bold screen titles / medium section headings / clear card
    // titles / smaller secondary metadata", distinct from the pre-existing
    // title (48, unused screen-title-sized) and subtitle (32, used as a
    // generic "big heading" today). None of the existing types changed size.
    | 'screenTitle'
    | 'sectionHeading'
    | 'cardTitle'
    | 'metadata';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  // 'metadata' reads as secondary by default (that's the point of the
  // type) without every call site having to also pass themeColor="textSecondary".
  // An explicit themeColor still wins.
  const defaultColor = type === 'metadata' ? 'textSecondary' : 'text';

  return (
    <Text
      style={[
        { color: theme[themeColor ?? defaultColor] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && [styles.linkPrimary, { color: theme.tint }],
        type === 'code' && styles.code,
        type === 'screenTitle' && styles.screenTitle,
        type === 'sectionHeading' && styles.sectionHeading,
        type === 'cardTitle' && styles.cardTitle,
        type === 'metadata' && styles.metadata,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  sectionHeading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: 700,
  },
  metadata: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
});
