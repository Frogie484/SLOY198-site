import assert from "node:assert/strict";
import test from "node:test";
import { BlobPreconditionFailedError } from "@vercel/blob";
import {
  BlobScheduleAdapter,
  ensureBlobConfigured,
  getBlobCommandOptions
} from "./server/vercel/blob-schedule-adapter.js";
import { BlobEducationAdapter } from "./server/vercel/blob-education-adapter.js";

const blobEnvironment = [
  "BLOB_STORE_ID",
  "BLOB_READ_WRITE_TOKEN",
  "VERCEL_OIDC_TOKEN"
];

const withBlobEnvironment = async (values, operation) => {
  const previous = Object.fromEntries(
    blobEnvironment.map((name) => [name, process.env[name]])
  );

  blobEnvironment.forEach((name) => delete process.env[name]);
  Object.entries(values).forEach(([name, value]) => {
    process.env[name] = value;
  });

  try {
    await operation();
  } finally {
    blobEnvironment.forEach((name) => {
      if (previous[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous[name];
      }
    });
  }
};

test("OIDC Blob mode accepts BLOB_STORE_ID and passes it to get and put", async () => {
  await withBlobEnvironment(
    {
      BLOB_STORE_ID: "store_test_oidc",
      VERCEL_OIDC_TOKEN: "test-oidc-token"
    },
    async () => {
      const calls = [];
      const adapter = new BlobScheduleAdapter({
        async get(pathname, options) {
          calls.push({ method: "get", pathname, options });
          return null;
        },
        async put(pathname, body, options) {
          calls.push({ method: "put", pathname, body, options });
          return { etag: "etag-1" };
        }
      });

      await adapter.init();
      assert.deepEqual(await adapter.read(), {
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
      await adapter.write({
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

      assert.equal(calls[0].method, "get");
      assert.equal(calls[0].options.storeId, "store_test_oidc");
      assert.equal(calls[0].options.access, "private");
      assert.equal(calls[1].method, "put");
      assert.equal(calls[1].options.storeId, "store_test_oidc");
      assert.equal(calls[1].options.access, "private");
    }
  );
});

test("legacy Blob mode still accepts BLOB_READ_WRITE_TOKEN", async () => {
  await withBlobEnvironment(
    { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_legacy" },
    async () => {
      assert.doesNotThrow(ensureBlobConfigured);
      assert.deepEqual(getBlobCommandOptions(), {});
    }
  );
});

test("Blob configuration fails only when neither mode is configured", async () => {
  await withBlobEnvironment({}, async () => {
    assert.throws(
      ensureBlobConfigured,
      (error) => error.statusCode === 503
    );
  });
});

test("mutation uses the current ETag and advances the storage revision", async () => {
  await withBlobEnvironment({ BLOB_STORE_ID: "store_test_oidc" }, async () => {
    let database = createDatabase({
      storage: { revision: 4, updatedAt: "before", mutationId: "previous" }
    });
    let etag = '"etag-4"';
    let putOptions;
    const adapter = new BlobScheduleAdapter({
      async get() {
        return createBlobResult(database, etag);
      },
      async put(_pathname, body, options) {
        putOptions = options;
        database = JSON.parse(body);
        etag = '"etag-5"';
        return { etag };
      }
    });

    const result = await adapter.mutate((draft) => {
      draft.slots.push({ id: "slot-1" });
      return "saved";
    }, createDatabase);

    assert.equal(result, "saved");
    assert.equal(putOptions.ifMatch, '"etag-4"');
    assert.equal(putOptions.allowOverwrite, true);
    assert.equal(putOptions.cacheControlMaxAge, 60);
    assert.equal(database.storage.revision, 5);
    assert.match(database.storage.mutationId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(database.storage.appliedMutationIds, [database.storage.mutationId]);
  });
});

test("a committed write with a lost response is verified instead of retried", async () => {
  await withBlobEnvironment({ BLOB_STORE_ID: "store_test_oidc" }, async () => {
    let database = createDatabase({
      storage: { revision: 7, updatedAt: "before", mutationId: "previous" }
    });
    let etag = '"etag-7"';
    let operationCalls = 0;
    let putCalls = 0;
    const logs = [];
    const adapter = new BlobScheduleAdapter({
      async get() {
        return createBlobResult(database, etag);
      },
      async put(_pathname, body) {
        putCalls += 1;
        database = JSON.parse(body);
        etag = '"etag-8"';
        throw new BlobPreconditionFailedError();
      }
    }, {
      logger: createLogger(logs),
      sleep: async () => {}
    });

    const result = await adapter.mutate((draft) => {
      operationCalls += 1;
      draft.slots.push({ id: "slot-after-lost-response" });
      return { id: "slot-after-lost-response" };
    }, createDatabase);

    assert.deepEqual(result, { id: "slot-after-lost-response" });
    assert.equal(operationCalls, 1);
    assert.equal(putCalls, 1);
    assert.deepEqual(database.slots.map((slot) => slot.id), ["slot-after-lost-response"]);
    assert.equal(database.storage.revision, 8);
    assert.equal(logs[0].level, "info");
    assert.match(logs[0].message, /write verified/);
  });
});

test("a committed mutation stays identifiable after a later concurrent write", async () => {
  await withBlobEnvironment({ BLOB_STORE_ID: "store_test_oidc" }, async () => {
    let database = createDatabase({
      storage: { revision: 20, updatedAt: "before", mutationId: "previous" }
    });
    let etag = '"etag-20"';
    let operationCalls = 0;
    const adapter = new BlobScheduleAdapter({
      async get() {
        return createBlobResult(database, etag);
      },
      async put(_pathname, body) {
        database = JSON.parse(body);
        database.slots.push({ id: "later-external-slot" });
        database.storage = {
          revision: 22,
          updatedAt: "later-external-write",
          mutationId: "later-external-mutation",
          appliedMutationIds: [
            ...database.storage.appliedMutationIds,
            "later-external-mutation"
          ]
        };
        etag = '"etag-22"';
        throw new BlobPreconditionFailedError();
      }
    }, {
      logger: createLogger([]),
      sleep: async () => {}
    });

    await adapter.mutate((draft) => {
      operationCalls += 1;
      draft.slots.push({ id: "our-slot" });
    }, createDatabase);

    assert.equal(operationCalls, 1);
    assert.deepEqual(
      database.slots.map((slot) => slot.id),
      ["our-slot", "later-external-slot"]
    );
  });
});

test("a real ETag conflict reloads and preserves both concurrent changes", async () => {
  await withBlobEnvironment({ BLOB_STORE_ID: "store_test_oidc" }, async () => {
    let database = createDatabase({
      storage: { revision: 10, updatedAt: "before", mutationId: "previous" }
    });
    let etag = '"etag-10"';
    let operationCalls = 0;
    let putCalls = 0;
    const logs = [];
    const adapter = new BlobScheduleAdapter({
      async get() {
        return createBlobResult(database, etag);
      },
      async put(_pathname, body) {
        putCalls += 1;
        if (putCalls === 1) {
          database.slots.push({ id: "external-slot" });
          database.storage = {
            revision: 11,
            updatedAt: "external",
            mutationId: "external-mutation",
            appliedMutationIds: ["external-mutation"]
          };
          etag = '"etag-11"';
          throw new BlobPreconditionFailedError();
        }
        database = JSON.parse(body);
        etag = '"etag-12"';
        return { etag };
      }
    }, {
      logger: createLogger(logs),
      sleep: async () => {}
    });

    await adapter.mutate((draft) => {
      operationCalls += 1;
      draft.slots.push({ id: `local-slot-${operationCalls}` });
    }, createDatabase);

    assert.equal(operationCalls, 2);
    assert.equal(putCalls, 2);
    assert.deepEqual(
      database.slots.map((slot) => slot.id),
      ["external-slot", "local-slot-2"]
    );
    assert.equal(database.storage.revision, 12);
    assert.equal(logs.filter((entry) => entry.level === "warn").length, 1);
    assert.equal(logs.find((entry) => entry.level === "warn").data.reason, "etag-mismatch");
  });
});

test("persistent ETag conflicts return 409 and log the diagnostic cause", async () => {
  await withBlobEnvironment({ BLOB_STORE_ID: "store_test_oidc" }, async () => {
    const database = createDatabase({
      storage: { revision: 2, updatedAt: "before", mutationId: "other" }
    });
    const logs = [];
    const adapter = new BlobScheduleAdapter({
      async get() {
        return createBlobResult(database, '"etag-2"');
      },
      async put() {
        throw new BlobPreconditionFailedError();
      }
    }, {
      logger: createLogger(logs),
      sleep: async () => {},
      maxMutationAttempts: 2
    });

    await assert.rejects(
      adapter.mutate((draft) => {
        draft.slots.push({ id: "never-saved" });
      }, createDatabase),
      (error) => error.statusCode === 409
    );

    assert.equal(logs.filter((entry) => entry.level === "warn").length, 2);
    assert.equal(logs.filter((entry) => entry.level === "error").length, 1);
    assert.equal(logs.at(-1).data.reason, "etag-mismatch");
  });
});

test("education storage uses its own Blob and never reports a schedule conflict", async () => {
  await withBlobEnvironment({ BLOB_STORE_ID: "store_test_oidc" }, async () => {
    const database = {
      version: 1,
      storage: {
        revision: 2,
        updatedAt: "before",
        mutationId: "other",
        appliedMutationIds: []
      },
      courses: []
    };
    const paths = [];
    const adapter = new BlobEducationAdapter({
      async get(pathname) {
        paths.push(pathname);
        return createBlobResult(database, '"etag-2"', pathname);
      },
      async put(pathname) {
        paths.push(pathname);
        throw new BlobPreconditionFailedError();
      }
    }, {
      logger: createLogger([]),
      sleep: async () => {},
      maxMutationAttempts: 1
    });

    await assert.rejects(
      adapter.mutate((draft) => {
        draft.courses.push({ id: "course-1" });
      }, () => structuredClone(database)),
      (error) =>
        error.statusCode === 409 &&
        /Данные обучения изменились/.test(error.message) &&
        !/Расписание/.test(error.message)
    );
    assert.ok(paths.every((pathname) => pathname === "sloy198/private/education.json"));
  });
});

const createDatabase = (overrides = {}) => ({
  version: 3,
  storage: {
    revision: 0,
    updatedAt: "",
    mutationId: "",
    appliedMutationIds: [],
    ...overrides.storage
  },
  slots: [],
  bookings: [],
  users: [],
  purchases: [],
  courses: [],
  lessons: [],
  ...overrides
});

const createBlobResult = (
  database,
  etag,
  pathname = "sloy198/private/schedule.json"
) => ({
  statusCode: 200,
  stream: new Blob([JSON.stringify(database)]).stream(),
  headers: new Headers(),
  blob: {
    etag,
    pathname
  }
});

const createLogger = (entries) => ({
  info(message, data) {
    entries.push({ level: "info", message, data });
  },
  warn(message, data) {
    entries.push({ level: "warn", message, data });
  },
  error(message, data) {
    entries.push({ level: "error", message, data });
  }
});
