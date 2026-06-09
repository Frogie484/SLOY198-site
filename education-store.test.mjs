import assert from "node:assert/strict";
import test from "node:test";
import { ScheduleStore } from "./schedule-store.mjs";
import { EducationStore } from "./education-store.mjs";

class MemoryAdapter {
  constructor(database) {
    this.database = database;
  }

  async init() {}

  async read() {
    return structuredClone(this.database);
  }

  async write(database) {
    this.database = structuredClone(database);
  }
}

const createEducationStore = async () => {
  const store = new EducationStore(new MemoryAdapter({
    version: 1,
    courses: []
  }));
  await store.init();
  return store;
};

test("education catalog hides video until the current user has access", async () => {
  const store = await createEducationStore();
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

  const catalog = await store.listCatalog("user-1");
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, course.id);
  assert.equal(catalog[0].hasAccess, false);
  assert.equal(catalog[0].shortDescription, "Краткое описание");
  assert.equal(catalog[0].fullDescription, "Полное описание");
  assert.equal(catalog[0].coverImageUrl, "https://example.com/preview.jpg");
  assert.equal("videoUrl" in catalog[0], false);

  await store.grantCourseAccess("user-1", course.id, "test");
  const purchasedCatalog = await store.listCatalog("user-1");
  assert.equal(purchasedCatalog[0].hasAccess, true);
  assert.equal(
    purchasedCatalog[0].videoUrl,
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  );

  const otherUserCatalog = await store.listCatalog("user-2");
  assert.equal(otherUserCatalog[0].hasAccess, false);
  assert.equal("videoUrl" in otherUserCatalog[0], false);
});

test("paid purchase grants lesson access while lesson order remains editable", async () => {
  const store = new ScheduleStore(new MemoryAdapter({
    version: 3,
    slots: [],
    bookings: [],
    users: [],
    purchases: [],
    courses: [],
    lessons: []
  }));
  await store.init();
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
