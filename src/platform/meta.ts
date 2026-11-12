// The `sync:meta` item (product spec §3.1). Versioning is owned by the migration runner, not WXT's `version`.

/** Fields a newer version stored in `meta` are kept by every write. */
export type Meta = {
  readonly schemaVersion?: number;
  readonly v1Imported?: true;
  readonly [field: string]: unknown;
};

const metaItem = storage.defineItem<Meta>('sync:meta', { fallback: {} });

/** The stored `meta`, or `{}` when it is missing or not an object. */
export async function readMeta(): Promise<Meta> {
  const value: unknown = await metaItem.getValue();
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Meta) : {};
}

/** Merges the fields into the stored `meta`, so `v1Imported` and unknown fields survive. */
export async function updateMeta(fields: Meta): Promise<void> {
  await metaItem.setValue({ ...(await readMeta()), ...fields });
}
