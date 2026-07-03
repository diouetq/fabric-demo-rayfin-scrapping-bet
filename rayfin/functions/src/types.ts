/**
 * Function schema types for RayfinClient.
 *
 * AUTO-GENERATED — do not edit manually.
 * Re-generated automatically when function source files change.
 *
 * If this file is not updating automatically, run:
 *   rayfin functions typegen --watch
 *
 * The schema is a closed object type: only the function names listed
 * below are accepted by RayfinClient.functions.<name>.invoke(...).
 * Adding, renaming, or changing the signature of a udf.func() call
 * regenerates this file and surfaces type errors at every consumer.
 *
 * IMPORTANT: This file must NOT import any Node.js packages — it is
 * resolved by the frontend app's TypeScript compiler.
 */

export type AppFunctionsSchema = {
  uploadParisImport: {
    input: { fileName: string; contentBase64: string };
    output: { url: string; bytesUploaded: number };
  };
  listImportPipelineJobs: {
    input: Record<string, never>;
    output: Array<{ id: string; status: string; startTime?: string; endTime?: string; failureReason?: string }>;
  };
};
