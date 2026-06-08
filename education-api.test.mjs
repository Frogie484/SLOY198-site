import assert from "node:assert/strict";
import test from "node:test";
import { ScheduleStore } from "./schedule-store.mjs";
import catalogHandler from "./api/education/catalog.js";
import testAccessHandler from "./api/education/test-access.js";
import contentHandler from "./api/admin/content.js";
import { setScheduleStoreForTests } from "./server/vercel/store.js";
import authHandler from "./api/admin/auth.js";

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

const request = ({ method = "GET", url = "/", body, cookie = "", query = {} }) => ({
  method,
  url,
  body,
  query,
  headers: { cookie, "x-forwarded-proto": "https" }
});

const response = () => {
  const headers = new Map();
  return {
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(body = "") {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body || "{}");
    }
  };
};

const call = async (handler, input) => {
  const output = response();
  await handler(input, output);
  return output;
};

test("education API creates an anonymous identity and grants test access through purchases", async () => {
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "preview";
  const store = new ScheduleStore(new MemoryAdapter());
  await store.init();
  setScheduleStoreForTests(store);

  const login = await call(authHandler, request({
    method: "POST",
    url: "/api/admin/auth?action=login",
    query: { action: "login" },
    body: { login: "admin", password: "sloy198-change-me" }
  }));
  const adminCookie = login.getHeader("set-cookie").split(";")[0];

  const createdCourse = await call(contentHandler, request({
    method: "POST",
    url: "/api/admin/content?action=courses",
    query: { action: "courses" },
    cookie: adminCookie,
    body: {
      title: "Курс",
      description: "Описание",
      previewImageUrl: "",
      price: 5000,
      status: "published"
    }
  }));
  assert.equal(createdCourse.statusCode, 201);
  const course = createdCourse.json().course;

  const lesson = await call(contentHandler, request({
    method: "POST",
    url: "/api/admin/content?action=lessons",
    query: { action: "lessons" },
    cookie: adminCookie,
    body: {
      courseId: course.id,
      title: "Урок",
      description: "",
      published: true
    }
  }));
  assert.equal(lesson.statusCode, 201);
  const lessonId = lesson.json().lesson.id;

  const catalog = await call(catalogHandler, request({
    url: "/api/education/catalog"
  }));
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json().courses[0].hasAccess, false);
  const clientCookie = catalog.getHeader("set-cookie").split(";")[0];
  assert.match(clientCookie, /sloy198_education_user=/);

  const access = await call(testAccessHandler, request({
    method: "POST",
    url: "/api/education/test-access",
    cookie: clientCookie,
    body: { courseId: course.id }
  }));
  assert.equal(access.statusCode, 200);
  assert.equal(access.json().purchase.provider, "test");

  const unlocked = await call(catalogHandler, request({
    url: "/api/education/catalog",
    cookie: clientCookie
  }));
  assert.equal(unlocked.json().courses[0].hasAccess, true);

  process.env.VERCEL_ENV = "production";
  const disabledInProduction = await call(testAccessHandler, request({
    method: "POST",
    url: "/api/education/test-access",
    cookie: clientCookie,
    body: { courseId: course.id }
  }));
  assert.equal(disabledInProduction.statusCode, 403);
  delete process.env.VERCEL_ENV;

  const updatedLesson = await call(contentHandler, request({
    method: "PATCH",
    url: `/api/admin/content?action=lesson&id=${lessonId}`,
    query: { action: "lesson", id: lessonId },
    cookie: adminCookie,
    body: { title: "Обновлённый урок" }
  }));
  assert.equal(updatedLesson.json().lesson.title, "Обновлённый урок");

  const adminAccess = await call(contentHandler, request({
    method: "POST",
    url: "/api/admin/content?action=course-access",
    query: { action: "course-access" },
    cookie: adminCookie,
    body: { userId: "admin-test-user", courseId: course.id }
  }));
  assert.equal(adminAccess.json().purchase.provider, "admin-test");

  const adminCatalog = await call(contentHandler, request({
    method: "GET",
    url: "/api/admin/content?action=courses",
    query: { action: "courses" },
    cookie: adminCookie
  }));
  assert.equal(adminCatalog.json().courses[0].lessons[0].title, "Обновлённый урок");

  const deletedLesson = await call(contentHandler, request({
    method: "DELETE",
    url: `/api/admin/content?action=lesson&id=${lessonId}`,
    query: { action: "lesson", id: lessonId },
    cookie: adminCookie
  }));
  assert.equal(deletedLesson.statusCode, 200);

  const deletedCourse = await call(contentHandler, request({
    method: "DELETE",
    url: `/api/admin/content?action=course&id=${course.id}`,
    query: { action: "course", id: course.id },
    cookie: adminCookie
  }));
  assert.equal(deletedCourse.statusCode, 200);
});
