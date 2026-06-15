export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueSlug(value: string, existing: Set<string>) {
  const base = slugify(value);
  let next = base;
  let index = 2;

  while (existing.has(next)) {
    next = `${base}-${index}`;
    index += 1;
  }

  existing.add(next);
  return next;
}
