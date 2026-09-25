import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PostJobForm } from '@/components/post-job-form';
import { supabase } from '@/lib/supabase';

// Reached from the invite chooser (invite/[handymanId]) via "New private job". Same form
// as the Post Job tab, but the job is posted invite_only to this handyman.
export default function NewPrivateJobScreen() {
  const { t } = useTranslation();
  const { handymanId } = useLocalSearchParams<{ handymanId: string }>();
  const [name, setName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!handymanId) return;
    let isMounted = true;
    supabase
      .from('handyman_profiles')
      .select('full_name')
      .eq('id', handymanId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) console.error('Failed to load handyman:', error.message);
        setName(data?.full_name ?? null);
      });
    return () => {
      isMounted = false;
    };
  }, [handymanId]);

  if (name === undefined) {
    return (
      <PlaceholderScreen
        title={t('postJob.inviteTitle')}
        description={t('common.loading')}
        edges={['left', 'right', 'bottom']}
      />
    );
  }
  if (name === null) {
    return (
      <PlaceholderScreen
        title={t('postJob.inviteTitle')}
        description={t('handymanPublicProfile.notFound')}
        edges={['left', 'right', 'bottom']}
      />
    );
  }
  return <PostJobForm invite={{ handymanId, handymanName: name }} />;
}
