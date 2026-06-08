import {
  BlobPreconditionFailedError,
  get,
  put
} from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { createHttpError } from "./http.js";

const BLOB_PATHNAME = "sloy198/private/schedule.json";
const MAX_MUTATION_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 35;

export class BlobScheduleAdapter {
  constructor(
    blobClient = { get, put },
    {
      logger = console,
      sleep = delay,
      maxMutationAttempts = MAX_MUTATION_ATTEMPTS
    } = {}
  ) {
    this.blobClient = blobClient;
    this.logger = logger;
    this.sleep = sleep;
    this.maxMutationAttempts = maxMutationAttempts;
  }

  async init() {
    ensureBlobConfigured();
  }

  async read() {
    const snapshot = await readSnapshot(this.blobClient);
    return snapshot.database;
  }

  async write(database) {
    ensureBlobConfigured();
    await this.blobClient.put(BLOB_PATHNAME, serialize(database), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      contentType: "application/json",
      ...getBlobCommandOptions()
    });
  }

  async mutate(operation, createEmptyDatabase) {
    ensureBlobConfigured();
    const mutationId = randomUUID();
    let lastConflict = null;

    for (let attempt = 0; attempt < this.maxMutationAttempts; attempt += 1) {
      const snapshot = await readSnapshot(this.blobClient, createEmptyDatabase);
      const result = await operation(snapshot.database);
      const previousRevision = getStorageRevision(snapshot.database);
      snapshot.database.storage = {
        revision: previousRevision + 1,
        updatedAt: new Date().toISOString(),
        mutationId,
        appliedMutationIds: appendMutationId(
          snapshot.database.storage?.appliedMutationIds,
          mutationId
        )
      };
      const serializedDatabase = serialize(snapshot.database);

      try {
        await this.blobClient.put(BLOB_PATHNAME, serializedDatabase, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: Boolean(snapshot.etag),
          cacheControlMaxAge: 60,
          contentType: "application/json",
          ...getBlobCommandOptions(),
          ...(snapshot.etag ? { ifMatch: snapshot.etag } : {})
        });
        return result;
      } catch (error) {
        const conflictLike = isOptimisticLockConflict(error);
        const latest = await readSnapshotAfterWriteError(
          this.blobClient,
          createEmptyDatabase,
          this.logger,
          mutationId,
          attempt,
          error
        );

        if (hasAppliedMutation(latest?.database, mutationId)) {
          this.logger.info?.("[schedule-store] write verified after ambiguous Blob response", {
            mutationId,
            attempt: attempt + 1,
            revision: latest.database.storage.revision,
            etag: latest.etag || null,
            errorName: error.name,
            errorMessage: error.message
          });
          return result;
        }

        const initialCreateRace =
          !snapshot.etag &&
          Boolean(latest?.etag) &&
          getStorageRevision(latest.database) > previousRevision;

        if (conflictLike || initialCreateRace) {
          lastConflict = {
            mutationId,
            attempt: attempt + 1,
            expectedEtag: snapshot.etag || null,
            actualEtag: latest?.etag || null,
            expectedRevision: previousRevision,
            actualRevision: latest ? getStorageRevision(latest.database) : null,
            errorName: error.name,
            errorMessage: error.message,
            reason: conflictLike ? "etag-mismatch" : "initial-create-race"
          };
          const willRetry = attempt + 1 < this.maxMutationAttempts;
          lastConflict.willRetry = willRetry;
          this.logger.warn?.("[schedule-store] optimistic lock conflict", lastConflict);
          if (willRetry) {
            await this.sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          }
          continue;
        }

        throw error;
      }
    }

    this.logger.error?.("[schedule-store] optimistic lock retries exhausted", lastConflict || {
      mutationId,
      attempts: this.maxMutationAttempts,
      reason: "unknown"
    });
    throw createHttpError(
      "Расписание изменилось одновременно с вашим запросом. Повторите действие.",
      409
    );
  }
}

const readSnapshot = async (
  blobClient,
  createEmptyDatabase = defaultEmptyDatabase
) => {
  ensureBlobConfigured();
  const result = await blobClient.get(BLOB_PATHNAME, {
    access: "private",
    useCache: false,
    ...getBlobCommandOptions()
  });

  if (!result) {
    return { database: createEmptyDatabase(), etag: null };
  }

  if (result.statusCode !== 200 || !result.stream) {
    throw createHttpError("Не удалось прочитать расписание.", 503);
  }

  const content = await new Response(result.stream).text();
  return {
    database: JSON.parse(content),
    etag: result.blob.etag
  };
};

const serialize = (database) => `${JSON.stringify(database, null, 2)}\n`;

const defaultEmptyDatabase = () => ({
  version: 3,
  storage: {
    revision: 0,
    updatedAt: "",
    mutationId: "",
    appliedMutationIds: []
  },
  slots: [],
  bookings: [],
  users: [],
  purchases: [],
  courses: [],
  lessons: []
});

const getStorageRevision = (database) =>
  Math.max(0, Number(database?.storage?.revision) || 0);

const hasAppliedMutation = (database, mutationId) =>
  database?.storage?.mutationId === mutationId ||
  database?.storage?.appliedMutationIds?.includes(mutationId);

const appendMutationId = (mutationIds, mutationId) =>
  [...new Set([...(Array.isArray(mutationIds) ? mutationIds : []), mutationId])].slice(-50);

const isOptimisticLockConflict = (error) =>
  error instanceof BlobPreconditionFailedError ||
  /precondition|etag mismatch|already exists|allowoverwrite/i.test(
    `${error?.name || ""} ${error?.message || ""}`
  );

const readSnapshotAfterWriteError = async (
  blobClient,
  createEmptyDatabase,
  logger,
  mutationId,
  attempt,
  writeError
) => {
  try {
    return await readSnapshot(blobClient, createEmptyDatabase);
  } catch (readError) {
    logger.error?.("[schedule-store] failed to inspect Blob after write error", {
      mutationId,
      attempt: attempt + 1,
      writeErrorName: writeError.name,
      writeErrorMessage: writeError.message,
      readErrorName: readError.name,
      readErrorMessage: readError.message
    });
    return null;
  }
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const getBlobCommandOptions = () => {
  const storeId = process.env.BLOB_STORE_ID?.trim();
  return storeId ? { storeId } : {};
};

export const ensureBlobConfigured = () => {
  const hasOidcStore = Boolean(process.env.BLOB_STORE_ID?.trim());
  const hasLegacyToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

  if (!hasOidcStore && !hasLegacyToken) {
    throw createHttpError(
      "Хранилище расписания не подключено. Добавьте Vercel Blob к проекту.",
      503
    );
  }
};
