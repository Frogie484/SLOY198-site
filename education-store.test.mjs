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

test("education catalog exposes only published content and never exposes video paths", async () => {
  const store = await createStore();
  const draft = await store.createCourse({
    title: "Черновик",
    description: "",
    status: "draft"
  });
  const course = await store.createCourse({
    title: "Основы",
    description: "Описание",
    previewImageUrl: "/preview.jpg",
    price: 4900,
    status: "published"
  });
  await store.createLesson({
    courseId: draft.id,
    title: "Скрытый курс",
    published: true,
    videoPath: "private/draft.mp4"
  });
  await store.createLesson({
    courseId: course.id,
    title: "Опубликованный урок",
    description: "Описание урока",
    published: true,
    videoPath: "private/published.mp4"
  });
  await store.createLesson({
    courseId: course.id,
    title: "Скрытый урок",
    published: false,
    videoPath: "private/hidden.mp4"
  });

  const catalog = await store.listEducationCatalog("user-1");
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, course.id);
  assert.equal(catalog[0].hasAccess, false);
  assert.equal(catalog[0].lessons.length, 1);
  assert.equal(catalog[0].lessons[0].videoAvailable, true);
  assert.equal("videoPath" in catalog[0].lessons[0], false);
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
