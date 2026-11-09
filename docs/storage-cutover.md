# Private S3 storage cutover

Configure the existing `AWS_S3_*` settings and `STORAGE_DRIVER=s3`. Backblaze B2 uses its S3 endpoint, region and `AWS_S3_FORCE_PATH_STYLE=true`; credentials belong only in the deployment's secret variables. Keep the bucket private.

Copy original objects with the same relative storage keys and verify their bytes before deployment. Retain the local volume and a protected backup. During the short cutover window, explicitly enable `STORAGE_LOCAL_READ_FALLBACK=true` and set `STORAGE_LOCAL_READ_FALLBACK_PATH` to the retained volume root. The fallback is disabled by default.

Reads consult S3 first and use the volume only after a confirmed missing-object response. Authentication and provider failures remain errors. New writes go to S3. Deletes write a private tombstone before deleting a primary object with a retained local copy, preventing resurrection. Absolute paths, traversal and symlink escapes are rejected.

Local-only copies fail until reconciliation because B2 does not implement conditional PUT; a check followed by an upload could overwrite a concurrent primary write. Local-only meeting playback uses the authenticated Meet stream endpoint instead of a nonexistent signed S3 URL.

After deployment, reconcile files written to the old volume during the build. Never overwrite a primary object written by the new application, and skip tombstoned files. Once all live keys are present in S3 and uploads/downloads/audio are verified, set `STORAGE_LOCAL_READ_FALLBACK=false`. Retain originals for rollback until the migration has been accepted. Do not detach or delete the volume as part of this deployment.

Validation: application-driver B2 checks cover uploads, recreated clients, multipart streams, Unicode copies, byte ranges, signed/private access and encryption; fallback checks cover precedence, deletion, traversal, provider failures and local-only copies. Meeting audio-link regression tests cover local-only streaming and provider errors.
