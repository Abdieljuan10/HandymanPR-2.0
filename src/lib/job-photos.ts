import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Shared between post-job.tsx and job/[id]/edit.tsx so the cap can't drift
// between posting a new job and editing an existing one.
export const MAX_JOB_PHOTOS = 10;

// A modern phone camera photo is easily 3-5MB and several thousand pixels on
// the long edge — overkill for viewing on a phone screen, and it costs both
// a handyman's cellular data and Supabase Storage quota. 1600px is plenty
// for a full-screen photo viewer; re-encoding as JPEG at 0.7 on top of that
// typically lands a compressed photo in the low hundreds of KB.
const MAX_DIMENSION = 1600;
const COMPRESS_QUALITY = 0.7;

export type CompressedPhoto = {
  uri: string;
  mimeType: string;
};

// Resizes to at most MAX_DIMENSION on the long edge (never upscales a
// smaller photo) and re-encodes as JPEG at COMPRESS_QUALITY. width/height
// come straight from the ImagePicker asset — pass the values as picked, not
// pre-computed, so a 0 (the system didn't report a dimension) safely skips
// resizing instead of risking an upscale.
export async function compressJobPhoto(
  uri: string,
  width: number,
  height: number
): Promise<CompressedPhoto> {
  const context = ImageManipulator.manipulate(uri);

  if (width > 0 && height > 0 && (width > MAX_DIMENSION || height > MAX_DIMENSION)) {
    if (height > width) {
      context.resize({ height: MAX_DIMENSION });
    } else {
      context.resize({ width: MAX_DIMENSION });
    }
  }

  const imageRef = await context.renderAsync();
  const result = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: COMPRESS_QUALITY });

  return { uri: result.uri, mimeType: 'image/jpeg' };
}

// Module-level, not a closure inside a component — Date.now() here would
// otherwise trip the React Compiler's purity check on some call shapes even
// though it only ever runs from an event handler, never during render.
export function jobPhotoStoragePath(jobId: string, sortOrder: number): string {
  return `${jobId}/${Date.now()}-${sortOrder}.jpg`;
}
