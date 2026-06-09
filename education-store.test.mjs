import assert from "node:assert/strict";
import test from "node:test";
import { ScheduleStore } from "./schedule-store.mjs";

class MemoryAdapter {
  constructor() {
    this.database = {
      version: 3,
      slots: [],
      bookings: [],
      users: [],
      purchases: [],
      courses: [],
      lessons: []
    };
  }

  async init() {}

  async read() {
    return structuredClone(this.database);
  }

  async write(database) {
    this.database = structuredClone(database);
  }
}

const createStore = async () => {
  const store = new ScheduleStore(new MemoryAdapter());
  await store.init();
  return store;
};

test("education catalog exposes published link-based courses with temporary access", async () => {
  const store = await createStore();
  await store.createCourse({
    title: "Черновик",
    shortDescription: "",
    videoUrl: "https://youtu.be/dQw4w9WgXcQ",
    status: "draft"
  });
  const course = await store.createCourse({
    title: "Основы",
    shortDescription: "Краткое описание",
    fullDescription: "Полное описание",
    coverImageUrl: "https://example.com/preview.jpg",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    price: 4900,
    status: "published"
  });

  const catalog = await store.listEducationCatalog("user-1");
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, course.id);
  assert.equal(catalog[0].hasAccess, true);
  assert.equal(catalog[0].shortDescription, "Краткое описание");
  assert.equal(catalog[0].fullDescription, "Полное описание");
  assert.equal(catalog[0].coverImageUrl, "https://example.com/preview.jpg");
  assert.equal(catalog[0].videoUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("paid purchase grants lesson access while lesson order remains editable", async () => {
  const store = await createStore();
  const course = await store.createCourse({
    title: "Практика",
    status: "published",
    price: 7900
  });
  const first = await store.createLesson({
    courseId: course.id,
    title: "Первый",
    published: true,
    videoPath: "private/first.mp4"
  });
  const second = await store.createLesson({
    courseId: course.id,
    title: "Второй",
    published: true,
    videoPath: "private/second.mp4"
  });

  await assert.rejects(
    store.getLessonWithAccess("user-1", first.id),
    (error) => error.statusCode === 403
  );
  await store.grantCourseAccess("user-1", course.id, "test");
  assert.equal((await store.getLessonWithAccess("user-1", first.id)).videoPath, "private/first.mp4");

  await store.moveLesson(second.id, "up");
  const courses = await store.listAdminCourses();
  assert.deepEqual(courses[0].lessons.map((lesson) => lesson.id), [second.id, first.id]);
});
