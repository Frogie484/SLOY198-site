import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const emptyDatabase = {
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
};

export class EducationStore {
  constructor(source) {
    this.adapter = typeof source === "string" ? new JsonFileAdapter(source) : source;
    this.mutationQueue = Promise.resolve();
  }

  async init() {
    await this.adapter.init?.(cloneEmptyDatabase(), normalizeDatabase);
  }

  async read() {
    const database = await this.adapter.read();
    normalizeDatabase(database);
    return database;
  }

  mutate(operation) {
    if (typeof this.adapter.mutate === "function") {
      return this.adapter.mutate(async (database) => {
        normalizeDatabase(database);
        return operation(database);
      }, cloneEmptyDatabase);
    }

    const mutation = this.mutationQueue.then(async () => {
      const database = await this.read();
      const result = await operation(database);
      await this.adapter.write(database);
      return result;
    });

    this.mutationQueue = mutation.catch(() => {});
    return mutation;
  }

  async listCatalog() {
    const database = await this.read();
    return database.courses
      .filter((course) => course.status === "published")
      .sort(compareCreated)
      .map((course) => ({
        ...course,
        // Replace this temporary flag with a paid purchase check when ЮKassa is connected.
        hasAccess: true
      }));
  }

  async listAdminCourses() {
    const database = await this.read();
    return database.courses.sort(compareCreated);
  }

  createCourse(input) {
    return this.mutate((database) => {
      const now = new Date().toISOString();
      const course = {
        id: randomUUID(),
        title: input.title,
        shortDescription: input.shortDescription || "",
        fullDescription: input.fullDescription || "",
        coverImageUrl: input.coverImageUrl || "",
        videoUrl: input.videoUrl || "",
        price: Number(input.price) || 0,
        status: input.status === "published" ? "published" : "draft",
        createdAt: now,
        updatedAt: now
      };
      database.courses.push(course);
      return course;
    });
  }

  updateCourse(courseId, input) {
    return this.mutate((database) => {
      const course = database.courses.find((item) => item.id === courseId);
      if (!course) {
        throw createEducationError("Курс не найден.", 404);
      }

      for (const field of [
        "title",
        "shortDescription",
        "fullDescription",
        "coverImageUrl",
        "videoUrl"
      ]) {
        if (input[field] !== undefined) {
          course[field] = String(input[field]).trim();
        }
      }
      if (input.price !== undefined) {
        course.price = Math.max(0, Number(input.price) || 0);
      }
      if (input.status !== undefined) {
        course.status = input.status === "published" ? "published" : "draft";
      }
      course.updatedAt = new Date().toISOString();
      return course;
    });
  }

  deleteCourse(courseId) {
    return this.mutate((database) => {
      const courseIndex = database.courses.findIndex((item) => item.id === courseId);
      if (courseIndex === -1) {
        throw createEducationError("Курс не найден.", 404);
      }
      database.courses.splice(courseIndex, 1);
      database.purchases = database.purchases.filter(
        (purchase) => purchase.courseId !== courseId
      );
      return { id: courseId };
    });
  }

  ensureUser(userId) {
    return this.mutate((database) => {
      let user = database.users.find((item) => item.id === userId);
      if (!user) {
        const now = new Date().toISOString();
        user = { id: userId, name: "", email: "", createdAt: now, updatedAt: now };
        database.users.push(user);
      }
      return user;
    });
  }

  grantCourseAccess(userId, courseId, provider = "test") {
    return this.mutate((database) => {
      const course = database.courses.find((item) => item.id === courseId);
      if (!course) {
        throw createEducationError("Курс не найден.", 404);
      }

      let user = database.users.find((item) => item.id === userId);
      if (!user) {
        const now = new Date().toISOString();
        user = { id: userId, name: "", email: "", createdAt: now, updatedAt: now };
        database.users.push(user);
      }

      const existing = database.purchases.find(
        (purchase) =>
          purchase.userId === userId &&
          purchase.courseId === courseId &&
          purchase.status === "paid"
      );
      if (existing) {
        return existing;
      }

      const now = new Date().toISOString();
      const purchase = {
        id: randomUUID(),
        userId,
        courseId,
        provider,
        status: "paid",
        amount: course.price,
        currency: "RUB",
        externalPaymentId: "",
        createdAt: now,
        updatedAt: now
      };
      database.purchases.push(purchase);
      return purchase;
    });
  }
}

class JsonFileAdapter {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async init(empty, normalize) {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const database = JSON.parse(await readFile(this.filePath, "utf8"));
      normalize(database);
      await this.write(database);
    } catch {
      await this.write(empty);
    }
  }

  async read() {
    return JSON.parse(await readFile(this.filePath, "utf8"));
  }

  async write(database) {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

const normalizeDatabase = (database) => {
  database.version = 1;
  database.storage = {
    revision: Math.max(0, Number(database.storage?.revision) || 0),
    updatedAt: String(database.storage?.updatedAt || ""),
    mutationId: String(database.storage?.mutationId || ""),
    appliedMutationIds: Array.isArray(database.storage?.appliedMutationIds)
      ? database.storage.appliedMutationIds.map(String).slice(-50)
      : []
  };
  database.courses = Array.isArray(database.courses) ? database.courses : [];
  database.users = Array.isArray(database.users) ? database.users : [];
  database.purchases = Array.isArray(database.purchases) ? database.purchases : [];
  database.courses.forEach((course) => {
    course.shortDescription = course.shortDescription || course.description || "";
    course.fullDescription = course.fullDescription || "";
    course.coverImageUrl = course.coverImageUrl || course.previewImageUrl || "";
    course.videoUrl = course.videoUrl || "";
    delete course.description;
    delete course.previewImageUrl;
    course.price = Number(course.price) || 0;
    course.status = course.status === "published" ? "published" : "draft";
    course.createdAt = course.createdAt || new Date().toISOString();
    course.updatedAt = course.updatedAt || course.createdAt;
  });
};

const compareCreated = (left, right) =>
  String(left.createdAt).localeCompare(String(right.createdAt));

const cloneEmptyDatabase = () => structuredClone(emptyDatabase);

export const createEducationError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};
