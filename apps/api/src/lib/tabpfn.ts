import { z } from 'zod';
import { PERSONALIZE_COLUMNS_V1, type PersonalizeRequest } from '@ramble/shared';

/**
 * Prior Labs TabPFN REST API (https://api.priorlabs.ai, /tabpfn/* JSON routes), server-side only.
 * Flow: prepare train upload → PUT CSVs → fit → prepare test upload → PUT CSV → predict.
 * The rows are anonymous integers (docs/ARCHITECTURE.md §8.2); no names, coordinates or ids.
 */
const BASE = 'https://api.priorlabs.ai';
const MODEL = 'v3.5_default';

export class TabPfnUnavailableError extends Error {}

export function tabPfnKey(): string | null {
  const key = process.env.TABPFN_API_KEY?.trim();
  return key && key !== 'unset' ? key : null;
}

const uploadTarget = z.object({ signed_urls: z.array(z.string().url()).min(1), required_headers: z.record(z.string(), z.string()).optional() });
const prepareTrain = z.object({ train_set_upload_id: z.string(), x_train_info: uploadTarget, y_train_info: uploadTarget });
const fitResponse = z.object({ fitted_train_set_id: z.string() });
const prepareTest = z.object({ test_set_upload_id: z.string(), x_test_info: uploadTarget });
const predictResponse = z.object({
  prediction: z.unknown(),
  metadata: z.object({ classes: z.array(z.union([z.number(), z.string()])).optional() }).passthrough(),
});

export function toCsv(header: readonly string[], rows: number[][]): string {
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

/** P(loved) for each test row, from a [rows][classes] probability matrix and the class order. */
export function lovedProbabilities(prediction: unknown, classes: (number | string)[] | undefined, expectedRows: number): number[] {
  if (!Array.isArray(prediction) || prediction.length !== expectedRows) throw new TabPfnUnavailableError('unexpected prediction shape');
  const idx = classes ? classes.findIndex((c) => String(c) === '1') : -1;
  return prediction.map((row) => {
    if (!Array.isArray(row) || row.length === 0) throw new TabPfnUnavailableError('unexpected prediction row');
    const p = Number(row[idx >= 0 ? idx : row.length - 1]);
    if (!Number.isFinite(p)) throw new TabPfnUnavailableError('non-numeric probability');
    return Math.min(1, Math.max(0, p));
  });
}

export async function predictLoved(req: PersonalizeRequest, fetchImpl: typeof fetch = fetch, timeoutMs = 25_000): Promise<number[]> {
  const key = tabPfnKey();
  if (!key) throw new TabPfnUnavailableError('TabPFN is not configured');
  const signal = AbortSignal.timeout(timeoutMs);
  const header = PERSONALIZE_COLUMNS_V1.map((c) => c.name);

  const call = async <T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> => {
    const res = await fetchImpl(`${BASE}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }).catch((e: unknown) => {
      throw new TabPfnUnavailableError(`TabPFN request failed: ${(e as Error).name}`);
    });
    if (!res.ok) throw new TabPfnUnavailableError(`TabPFN ${path} responded ${res.status}`);
    // Long fits may stream keepalive whitespace before the JSON; text() + trim handles it.
    const parsed = schema.safeParse(JSON.parse((await res.text()).trim()));
    if (!parsed.success) throw new TabPfnUnavailableError(`TabPFN ${path}: unexpected response`);
    return parsed.data;
  };

  const put = async (target: z.infer<typeof uploadTarget>, csv: string) => {
    const res = await fetchImpl(target.signed_urls[0]!, { method: 'PUT', headers: target.required_headers ?? {}, body: csv, signal }).catch((e: unknown) => {
      throw new TabPfnUnavailableError(`TabPFN upload failed: ${(e as Error).name}`);
    });
    if (!res.ok) throw new TabPfnUnavailableError(`TabPFN upload responded ${res.status}`);
  };

  const train = await call('/tabpfn/prepare_train_set_upload', { x_train_info: { format: 'csv' }, y_train_info: { format: 'csv' } }, prepareTrain);
  await Promise.all([put(train.x_train_info, toCsv(header, req.train)), put(train.y_train_info, toCsv(['loved'], req.labels.map((l) => [l])))]);
  const fit = await call('/tabpfn/fit', { train_set_upload_id: train.train_set_upload_id, task_config: { task: 'classification', tabpfn_config: { model_path: MODEL } } }, fitResponse);
  const test = await call('/tabpfn/prepare_test_set_upload', { fitted_train_set_id: fit.fitted_train_set_id, x_test_info: { format: 'csv' } }, prepareTest);
  await put(test.x_test_info, toCsv(header, req.test));
  const out = await call(
    '/tabpfn/predict',
    { test_set_upload_id: test.test_set_upload_id, fitted_train_set_id: fit.fitted_train_set_id, task_config: { task: 'classification', predict_params: { output_type: 'probas' } } },
    predictResponse,
  );
  return lovedProbabilities(out.prediction, out.metadata.classes, req.test.length);
}
