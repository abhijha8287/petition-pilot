import type { Json } from './types';

/** Non-null JSON for jsonb columns declared NOT NULL. */
export type JsonValue = NonNullable<Json>;
