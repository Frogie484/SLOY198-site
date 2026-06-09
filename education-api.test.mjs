import assert from "node:assert/strict";
import test from "node:test";
import { ScheduleStore } from "./schedule-store.mjs";
import catalogHandler from "./api/education/catalog.js";
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

test("education API supports link-based course CRUD and temporary public access", async () => {
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
      shortDescription: "Краткое описание",
      fullDescription: "Полное описание",
      coverImageUrl: "https://example.com/course.jpg",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      price: 5000,
      status: "published"
    }
  }));
  assert.equal(createdCourse.statusCode, 201);
  const course = createdCourse.json().course;

  const catalog = await call(catalogHandler, request({
    url: "/api/education/catalog"
  }));
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json().courses[0].hasAccess, true);
  assert.equal(
    catalog.json().courses[0].videoUrl,
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  );
  const clientCookie = catalog.getHeader("set-cookie").split(";")[0];
  assert.match(clientCookie, /sloy198_education_user=/);

  const updatedCourse = await call(contentHandler, request({
    method: "PATCH",
    url: `/api/admin/content?action=course&id=${course.id}`,
    query: { action: "course", id: course.id },
    cookie: adminCookie,
    body: {
      title: "Обновлённый курс",
      videoUrl: "https://vimeo.com/76979871",
      status: "draft"
    }
  }));
  assert.equal(updatedCourse.json().course.title, "Обновлённый курс");
  assert.equal(updatedCourse.json().course.videoUrl, "https://vimeo.com/76979871");
  assert.equal(updatedCourse.json().course.status, "draft");

  const adminCatalog = await call(contentHandler, request({
    method: "GET",
    url: "/api/admin/content?action=courses",
    query: { action: "courses" },
    cookie: adminCookie
  }));
  assert.equal(adminCatalog.json().courses[0].fullDescription, "Полное описание");

  const invalidVideo = await call(contentHandler, request({
    method: "PATCH",
    url: `/api/admin/content?action=course&id=${course.id}`,
    query: { action: "course", id: course.id },
    cookie: adminCookie,
    body: { videoUrl: "https://example.com/video" }
  }));
  assert.equal(invalidVideo.statusCode, 400);

  const deletedCourse = await call(contentHandler, request({
    method: "DELETE",
    url: `/api/admin/content?action=course&id=${course.id}`,
    query: { action: "course", id: course.id },
    cookie: adminCookie
  }));
  assert.equal(deletedCourse.statusCode, 200);
  delete process.env.VERCEL_ENV;
});
