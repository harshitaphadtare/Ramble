/**
 * Pinned model files. Revisions are commit SHAs (never `main`) and every file is
 * checked against its SHA-256 before first use. See docs/SECURITY.md §5.6.
 */
export interface ModelFile {
  id: string;
  label: string;
  url: string;
  sha256: string;
  bytes: number;
  licence: string;
}

const HF = 'https://huggingface.co';

export const GEMMA_4_E2B_WEB: ModelFile = {
  id: 'gemma-4-e2b-web',
  label: 'Gemma 4 E2B (LiteRT-LM, WebGPU)',
  url: `${HF}/litert-community/gemma-4-E2B-it-litert-lm/resolve/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1/gemma-4-E2B-it-web.litertlm`,
  sha256: '3a08e8d94e23b814ae5414469c370c503813949acb8ceaa17e4ebf8a35af35b5',
  bytes: 2_008_000_000,
  licence: 'Apache-2.0',
};

/** Small-device fallback, run with Transformers.js. q4 weights keep fp32 activations (avoids the fp16 WebGPU bug). */
export const GEMMA_3_270M = {
  id: 'gemma-3-270m',
  label: 'Gemma 3 270M (Transformers.js)',
  repo: 'onnx-community/gemma-3-270m-it-ONNX',
  revision: '2dbbfdb1b59bd034eb959428c6a7da9dd7ea27f0',
  dtype: 'q4',
  approxBytes: 323_000_000,
  licence: 'Gemma Terms of Use',
} as const;

/** Self-hosted LiteRT-LM runtime (copied from node_modules at build time; never loaded from a CDN). */
export const LITERT_WASM_DIR = '/wasm/litertlm/';
/** Self-hosted ONNX Runtime Web files for Transformers.js. */
export const ORT_WASM_DIR = '/wasm/ort/';
