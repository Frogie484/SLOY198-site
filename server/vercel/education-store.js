import { EducationStore } from "../../education-store.mjs";
import { BlobEducationAdapter } from "./blob-education-adapter.js";

let storePromise;

export const getEducationStore = () => {
  if (!storePromise) {
    storePromise = (async () => {
      const store = new EducationStore(new BlobEducationAdapter());
      await store.init();
      return store;
    })();
  }
  return storePromise;
};

export const setEducationStoreForTests = (store) => {
  storePromise = Promise.resolve(store);
};
