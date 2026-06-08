import { ScheduleStore } from "../../schedule-store.mjs";
import { BlobScheduleAdapter } from "./blob-schedule-adapter.js";

let storePromise;

export const getScheduleStore = () => {
  if (!storePromise) {
    storePromise = (async () => {
      const store = new ScheduleStore(new BlobScheduleAdapter());
      await store.init();
      return store;
    })();
  }

  return storePromise;
};

export const setScheduleStoreForTests = (store) => {
  storePromise = Promise.resolve(store);
};
