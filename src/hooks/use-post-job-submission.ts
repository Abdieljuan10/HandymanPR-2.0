import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmAsync, notify } from '@/lib/confirm';
import { compressJobPhoto, jobPhotoStoragePath, MAX_JOB_PHOTOS } from '@/lib/job-photos';
import { supabase } from '@/lib/supabase';
import { usePueblos } from '@/hooks/use-pueblos';
import { useSession } from '@/providers/session-provider';

export const MIN_BIDS = 3;
export const DEFAULT_BIDS = 5;

// A direct invite: the job is posted invite_only to this one handyman
// (jobs.visibility / invited_handyman_id, enforced by jobs_select RLS and
// the bid-insert guard). Nobody else sees it in their feed.
export type Invite = { handymanId: string; handymanName: string };

export type PostJobFieldErrors = {
  title?: string;
  trade?: string;
  pueblo?: string;
  address?: string;
};

type UsePostJobSubmissionOptions = {
  invite?: Invite;
  /**
   * Called when handleSubmit's own validation fails (should be rare -- each
   * consumer is expected to have already checked required fields before
   * calling handleSubmit; this is the same final safety-net check the
   * original single-page form always ran right before posting). Lets each
   * UI react its own way (PostJobForm scrolls to top; the wizard jumps back
   * to whichever step owns the failing field) without this hook knowing
   * anything about scroll refs or wizard steps.
   */
  onValidationError?: (errors: PostJobFieldErrors) => void;
};

// Extracted 2026-09-26 so the Post Job wizard and the existing invite-flow
// form (post-job-form.tsx, unchanged) share exactly ONE implementation of
// "what happens when you submit a job" -- previously this all lived inline
// in post-job-form.tsx. Every field, validation rule, Supabase call, and
// the exact insert/rollback/upload sequence below are copied verbatim, not
// reworked -- this is an extraction, not a rewrite.
export function usePostJobSubmission({ invite, onValidationError }: UsePostJobSubmissionOptions = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { pueblos, error: pueblosError } = usePueblos();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [tradeIds, setTradeIds] = useState<number[]>([]);
  const [puebloSlugs, setPuebloSlugs] = useState<string[]>([]);
  const [maxBids, setMaxBids] = useState(DEFAULT_BIDS);
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [fieldErrors, setFieldErrors] = useState<PostJobFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // True from the instant a submission succeeds until this hook's owning
  // screen either navigates away or is revisited later. Exists only so a UI
  // that stays mounted after router.push/replace (a tab screen underneath a
  // pushed stack entry never unmounts) can render something other than its
  // now-emptied form the moment the fields below get reset. Consumers that
  // don't render conditionally on this (post-job-form.tsx) are completely
  // unaffected by it.
  const [submitSucceeded, setSubmitSucceeded] = useState(false);

  async function handlePickPhotos() {
    if (photos.length >= MAX_JOB_PHOTOS) {
      notify({ title: t('postJob.photoLimitTitle'), message: t('postJob.photoLimit', { max: MAX_JOB_PHOTOS }) });
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    });

    if (result.canceled) return;

    const remainingSlots = MAX_JOB_PHOTOS - photos.length;
    const accepted = result.assets.slice(0, remainingSlots);
    setPhotos((prev) => [...prev, ...accepted]);

    if (result.assets.length > remainingSlots) {
      notify({ title: t('postJob.photoLimitTitle'), message: t('postJob.photoLimit', { max: MAX_JOB_PHOTOS }) });
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function validateRequiredFields(): PostJobFieldErrors {
    const errors: PostJobFieldErrors = {};
    if (!title.trim()) errors.title = t('postJob.errors.title');
    if (tradeIds.length === 0) errors.trade = t('postJob.errors.trade');
    if (puebloSlugs.length === 0) errors.pueblo = t('postJob.errors.pueblo');
    if (!address.trim()) errors.address = t('postJob.errors.address');
    return errors;
  }

  function confirmOptionalFields(missingDescription: boolean, missingPhotos: boolean): Promise<boolean> {
    if (!missingDescription && !missingPhotos) return Promise.resolve(true);

    const message =
      missingDescription && missingPhotos
        ? t('postJob.nudgeBoth')
        : missingPhotos
          ? t('postJob.nudgePhotos')
          : t('postJob.nudgeDescription');

    return confirmAsync({
      title: t('postJob.nudgeTitle'),
      message,
      confirmLabel: t('postJob.postAnyway'),
      cancelLabel: t('postJob.cancel'),
    });
  }

  async function handleSubmit() {
    const errors = validateRequiredFields();
    setFieldErrors(errors);
    setSubmitError(null);

    if (Object.keys(errors).length > 0) {
      onValidationError?.(errors);
      return;
    }

    const shouldProceed = await confirmOptionalFields(!description.trim(), photos.length === 0);
    if (!shouldProceed) return;

    if (!session || !pueblos) return;

    setSubmitting(true);

    const puebloId = pueblos.find((p) => p.slug === puebloSlugs[0])?.id;

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        client_id: session.user.id,
        trade_id: tradeIds[0],
        pueblo_id: puebloId,
        title: title.trim(),
        description: description.trim(),
        max_bids: maxBids,
        ...(invite ? { visibility: 'invite_only', invited_handyman_id: invite.handymanId } : {}),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      setSubmitError(jobError?.message ?? 'Unknown error');
      setSubmitting(false);
      return;
    }

    const { error: locationError } = await supabase
      .from('job_locations')
      .insert({ job_id: job.id, full_address: address.trim() });

    if (locationError) {
      // Roll the job back: left in place it's a live job with no address
      // that handymen can already see and bid on, and "try again" would post
      // a duplicate. (Its new-job push has already gone out -- a job and its
      // address can only be made atomic server-side.)
      const { error: rollbackError } = await supabase.from('jobs').delete().eq('id', job.id);
      if (rollbackError) console.error('Failed to roll back job without address:', rollbackError.message);
      setSubmitError(locationError.message);
      setSubmitting(false);
      return;
    }

    let failedPhotos = 0;
    for (const [index, photo] of photos.entries()) {
      try {
        const compressed = await compressJobPhoto(photo.uri, photo.width, photo.height);
        const response = await fetch(compressed.uri);
        const arrayBuffer = await response.arrayBuffer();
        const path = jobPhotoStoragePath(job.id, index);

        const { error: uploadError } = await supabase.storage
          .from('job-photos')
          .upload(path, arrayBuffer, { contentType: compressed.mimeType });

        if (uploadError) {
          console.warn('Photo upload failed:', uploadError.message);
          failedPhotos += 1;
          continue;
        }

        const { data: publicUrl } = supabase.storage.from('job-photos').getPublicUrl(path);
        const { error: photoRowError } = await supabase
          .from('job_photos')
          .insert({ job_id: job.id, photo_url: publicUrl.publicUrl, sort_order: index });
        if (photoRowError) {
          console.warn('Photo record failed:', photoRowError.message);
          failedPhotos += 1;
        }
      } catch (photoError) {
        console.warn('Photo upload failed:', photoError);
        failedPhotos += 1;
      }
    }

    // The job itself is posted either way; say so rather than letting
    // missing photos look like the post went through complete.
    if (failedPhotos > 0) {
      notify({
        title: t('common.photosFailedTitle'),
        message: t('common.photosFailed', { count: failedPhotos }),
      });
    }

    // Set before the resets below (React batches these into one re-render
    // regardless of order, but this documents intent): any UI keying off
    // submitSucceeded sees it flip true in the SAME update that empties the
    // fields, so it never has a chance to render the reset, now-blank state.
    setSubmitSucceeded(true);
    setSubmitting(false);
    setTitle('');
    setDescription('');
    setAddress('');
    setTradeIds([]);
    setPuebloSlugs([]);
    setMaxBids(DEFAULT_BIDS);
    setPhotos([]);
    if (invite) {
      // The invite screen is a stack screen, not a tab: replace it so Back
      // from the new job returns to the handyman's profile, not a spent form.
      router.replace(`/job/${job.id}`);
      return;
    }
    // push (not replace): replace would drop the tab navigator from history,
    // leaving no way back to the tab bar after viewing the new job.
    router.push(`/job/${job.id}`);
  }

  return {
    pueblos,
    pueblosError,
    title,
    setTitle,
    description,
    setDescription,
    address,
    setAddress,
    tradeIds,
    setTradeIds,
    puebloSlugs,
    setPuebloSlugs,
    maxBids,
    setMaxBids,
    photos,
    setPhotos,
    fieldErrors,
    setFieldErrors,
    submitError,
    submitting,
    submitSucceeded,
    setSubmitSucceeded,
    handlePickPhotos,
    removePhoto,
    validateRequiredFields,
    handleSubmit,
  };
}
