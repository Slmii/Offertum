import { helloFn } from '@/modules/inngest/functions/hello.function';

/**
 * Every Inngest function in the app, in the order Inngest expects them at the
 * `/api/inngest` discovery endpoint. New functions: import + add to this array; they'll
 * show up in the dev UI on next reload.
 *
 * Future  /  /  functions register here too — keep this list flat (no
 * per-domain nested arrays) so the registration surface stays trivially auditable.
 */
export const inngestFunctions = [helloFn];
