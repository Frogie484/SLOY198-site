import assert from "node:assert/strict";
import test from "node:test";
import {
  BlobScheduleAdapter,
  ensureBlobConfigured,
  getBlobCommandOptions
} from "./server/vercel/blob-schedule-adapter.js";

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
        slots: [],
        bookings: [],
        users: [],
        purchases: [],
        courses: [],
        lessons: []
      });
      await adapter.write({
        version: 3,
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
