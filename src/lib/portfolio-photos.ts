// Shared between portfolio/new.tsx and portfolio/[id]/index.tsx so the cap
// can't drift between creating a project and editing one.
export const MAX_PROJECT_PHOTOS = 15;

export function storagePathFromPortfolioUrl(url: string): string | null {
  const marker = '/object/public/portfolio-photos/';
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

// Module-level, not a closure inside a component -- Date.now() here would
// otherwise trip the React Compiler's purity check on some call shapes even
// though it only ever runs from an event handler, never during render (same
// reasoning as jobPhotoStoragePath in job-photos.ts).
export function portfolioPhotoStoragePath(handymanId: string, sortOrder: number): string {
  return `${handymanId}/${Date.now()}-${sortOrder}.jpg`;
}
