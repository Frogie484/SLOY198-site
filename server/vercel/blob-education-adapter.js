import { BlobScheduleAdapter } from "./blob-schedule-adapter.js";

const EDUCATION_BLOB_PATHNAME = "sloy198/private/education.json";

const createEmptyEducationDatabase = () => ({
  version: 1,
  storage: {
    revision: 0,
    updatedAt: "",
    mutationId: "",
    appliedMutationIds: []
  },
  courses: [],
  users: [],
  purchases: []
});

export class BlobEducationAdapter extends BlobScheduleAdapter {
  constructor(blobClient, options = {}) {
    super(blobClient, {
      ...options,
      pathname: EDUCATION_BLOB_PATHNAME,
      logLabel: "education-store",
      conflictMessage:
        "Данные обучения изменились одновременно с вашим запросом. Повторите действие.",
      readErrorMessage: "Не удалось прочитать данные обучения.",
      createEmptyDatabase: createEmptyEducationDatabase
    });
  }
}
