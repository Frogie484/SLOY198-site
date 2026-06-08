import {
  BlobPreconditionFailedError,
  get,
  put
} from "@vercel/blob";
import { createHttpError } from "./http.js";

const BLOB_PATHNAME = "sloy198/private/schedule.json";
const MAX_MUTATION_ATTEMPTS = 6;

export class BlobScheduleAdapter {
  async init() {
    ensureBlobConfigured();
  }

  async read() {
    const snapshot = await readSnapshot();
    return snapshot.database;
  }

  async write(database) {
    ensureBlobConfigured();
    await put(BLOB_PATHNAME, serialize(database), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      contentType: "application/json"
    });
  }

  async mutate(operation, createEmptyDatabase) {
    ensureBlobConfigured();

    for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
      const snapshot = await readSnapshot(createEmptyDatabase);
      const result = await operation(snapshot.database);

      try {
        await put(BLOB_PATHNAME, serialize(snapshot.database), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: Boolean(snapshot.etag),
          cacheControlMaxAge: 0,
          contentType: "application/json",
          ...(snapshot.etag ? { ifMatch: snapshot.etag } : {})
        });
        return result;
      } catch (error) {
        const createdByAnotherRequest =
          !snapshot.etag && Boolean((await readSnapshot(createEmptyDatabase)).etag);
        if (error instanceof BlobPreconditionFailedError || createdByAnotherRequest) {
          continue;
        }
        throw error;
      }
    }

    throw createHttpError(
      "Расписание изменилось одновременно с вашим запросом. Повторите действие.",
      409
    );
  }
}

const readSnapshot = async (createEmptyDatabase = defaultEmptyDatabase) => {
  ensureBlobConfigured();
  const result = await get(BLOB_PATHNAME, {
    access: "private",
    useCache: false
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

const defaultEmptyDatabase = () => ({ version: 2, slots: [], bookings: [] });

const ensureBlobConfigured = () => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw createHttpError(
      "Хранилище расписания не подключено. Добавьте Vercel Blob к проекту.",
      503
    );
  }
};
