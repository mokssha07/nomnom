/**
 * Dish photos, in order of preference:
 *
 *   1. what the backend sent   (item.image — a real upload, always right)
 *   2. a local file of that name  (our own shots, so a demo looks finished)
 *   3. nothing                  (the layout copes; see PLACEHOLDER)
 *
 * The lookup is BY NAME, not by id. Ids belong to whichever database is
 * answering — the mock numbers Masala Dosa 1, and there is no reason Django
 * agrees — so keying photos by id meant every picture moved the day we
 * pointed at the real backend. Names are what both systems actually share.
 *
 * Files stay named `<id>-<slug>.webp`; the id prefix is just how they sort in
 * the folder and is skipped when reading them. `eager: true` resolves them at
 * build time into hashed URLs rather than fetching lazily at runtime.
 */

const files = import.meta.glob('./food/*.webp', { eager: true, query: '?url', import: 'default' });

/** 'Paneer Butter Masala' and 'paneer-butter-masala' must land on the same key. */
function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const byName = new Map(
  Object.entries(files).map(([path, url]) => {
    // './food/13-paneer-butter-masala.webp' → 'paneer-butter-masala'
    const stem = path.split('/').pop().replace(/\.webp$/, '');
    return [slug(stem.replace(/^\d+-/, '')), url];
  }),
);

/**
 * A grey tile, inline, for a slot that must be filled even when there is no
 * photo. A data URI rather than a file: it costs no request and cannot 404.
 * ponytail: plain grey, swap in a drawn bowl if it ever looks bare.
 */
export const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="%23d8cec2"/></svg>',
  );

/** The photo URL for a menu item, or null when nobody has one. */
export function photoFor(item) {
  if (!item) return null;
  return item.image ?? byName.get(slug(item.name)) ?? null;
}
