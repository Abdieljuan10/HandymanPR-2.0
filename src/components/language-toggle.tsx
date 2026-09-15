import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { Spacing } from '@/constants/theme';
import { useLanguage } from '@/providers/language-provider';

export function LanguageToggle() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <View style={styles.row}>
      <PrimaryButton
        label={t('common.spanish')}
        variant={language === 'es' ? 'primary' : 'secondary'}
        onPress={() => setLanguage('es')}
        style={styles.button}
      />
      <PrimaryButton
        label={t('common.english')}
        variant={language === 'en' ? 'primary' : 'secondary'}
        onPress={() => setLanguage('en')}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
  },
});
