import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { ScheduleStore } from "./schedule-store.mjs";
import {
  createPrivateVideoPlayback,
  deletePrivateVideos
} from "./server/vercel/education-media.js";
import {
  ensureEducationIdentity,
  getEducationUser
} from "./server/vercel/education-session.js";
import {
  validateCourse,
  validateLesson
} from "./server/vercel/education-validation.js";
import { isPublicTestAccessEnabled } from "./server/vercel/education-access.js";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const host = getArg("--host", "0.0.0.0");
const requestedPort = Number(getArg("--port", "5173"));
let activePort = requestedPort;
const root = resolve(".");
const store = new ScheduleStore(join(root, "data", "schedule.json"));
const sessions = new Map();
const sessionLifetime = 8 * 60 * 60 * 1000;
const adminLogin = process.env.ADMIN_LOGIN || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "sloy198-change-me";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const resolveRequestPath = async (url) => {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requested = pathname === "/"
    ? "index.html"
    : pathname === "/admin" || pathname === "/admin/"
      ? "admin.html"
      : pathname.replace(/^\/+/, "");
  const normalized = normalize(requested);
  const candidate = resolve(root, normalized);

  if (
    (candidate !== root && !candidate.startsWith(`${root}${sep}`)) ||
    normalized === "data" ||
    normalized.startsWith(`data${sep}`)
  ) {
    return null;
  }

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const indexFile = join(candidate, "index.html");
      await access(indexFile);
      return indexFile;
    }
    return candidate;
  } catch {
    return null;
  }
};

const sendJson = (response, statusCode, data, headers = {}) => {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(data));
};

const readJsonBody = async (request) => {
  const chunks = [];
  let totalSize = 0;

  for await (const chunk of request) {
    totalSize += chunk.length;
    if (totalSize > 1_000_000) {
      throw Object.assign(new Error("Слишком большой запрос."), { statusCode: 413 });
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Некорректный JSON."), { statusCode: 400 });
  }
};

const parseCookies = (request) =>
  Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [name, decodeURIComponent(value)])
  );

const isAdminRequest = (request) => {
  const sessionId = parseCookies(request).sloy198_admin_session;
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session) {
    return false;
  }

  if (Date.now() - session.createdAt > sessionLifetime) {
    sessions.delete(sessionId);
    return false;
  }

  return true;
};

const equalCredentials = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const validateSlot = (body) => {
  const duration = Number(body.duration);
  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "");
  const timeIsValid = /^\d{2}:\d{2}$/.test(body.time || "");
  const type = String(body.type || "").trim();

  if (!dateIsValid || !timeIsValid || !Number.isInteger(duration) || duration < 15 || !type) {
    throw Object.assign(new Error("Заполните дату, время, длительность и тип консультации."), {
      statusCode: 400
    });
  }

  return { date: body.date, time: body.time, duration, type };
};

const validateBooking = (body) => {
  const booking = {
    slotId: String(body.slotId || "").trim(),
    name: String(body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    telegram: String(body.telegram || "").trim(),
    birthDate: String(body.birthDate || "").trim(),
    comment: String(body.comment || "").trim()
  };

  if (!booking.slotId || booking.name.length < 2 || booking.phone.length < 5 || !booking.telegram) {
    throw Object.assign(new Error("Выберите время и заполните имя, телефон и Telegram."), {
      statusCode: 400
    });
  }

  return booking;
};

const handleApiRequest = async (request, response, pathname) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const adminAction = requestUrl.searchParams.get("action") || "";
  if (request.method === "GET" && pathname === "/api/slots") {
    sendJson(response, 200, { slots: await store.listAvailableSlots() });
    return true;
  }

  if (request.method === "POST" && pathname === "/api/bookings") {
    const booking = validateBooking(await readJsonBody(request));
    const result = await store.createBooking(booking);
    sendJson(response, 201, result);
    return true;
  }

  if (request.method === "GET" && pathname === "/api/education/catalog") {
    const identity = ensureEducationIdentity(request);
    await store.ensureEducationUser(identity.user.id);
    sendJson(response, 200, {
      userId: identity.user.id,
      courses: await store.listEducationCatalog(identity.user.id),
      testAccessEnabled: isPublicTestAccessEnabled()
    }, identity.cookie ? { "Set-Cookie": identity.cookie } : {});
    return true;
  }

  if (request.method === "POST" && pathname === "/api/education/test-access") {
    if (!isPublicTestAccessEnabled()) {
      sendJson(response, 403, { error: "Тестовый доступ отключён." });
      return true;
    }
    const identity = ensureEducationIdentity(request);
    const body = await readJsonBody(request);
    await store.ensureEducationUser(identity.user.id);
    const purchase = await store.grantCourseAccess(
      identity.user.id,
      String(body.courseId || "").trim(),
      "test"
    );
    sendJson(response, 200, { purchase }, identity.cookie
      ? { "Set-Cookie": identity.cookie }
      : {});
    return true;
  }

  if (request.method === "GET" && pathname === "/api/education/video") {
    const user = getEducationUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Требуется доступ к курсу." });
      return true;
    }
    const lessonId = new URL(request.url || "/", "http://localhost").searchParams.get("id");
    const lesson = await store.getLessonWithAccess(user.id, lessonId);
    sendJson(response, 200, await createPrivateVideoPlayback(lesson.videoPath));
    return true;
  }

  if (
    request.method === "POST" &&
    (pathname === "/api/admin/login" ||
      (pathname === "/api/admin/auth" && adminAction === "login"))
  ) {
    const body = await readJsonBody(request);
    const credentialsAreValid =
      equalCredentials(body.login, adminLogin) && equalCredentials(body.password, adminPassword);

    if (!credentialsAreValid) {
      sendJson(response, 401, { error: "Неверный логин или пароль." });
      return true;
    }

    const sessionId = randomUUID();
    sessions.set(sessionId, { createdAt: Date.now() });
    sendJson(response, 200, { authenticated: true }, {
      "Set-Cookie": `sloy198_admin_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`
    });
    return true;
  }

  if (
    request.method === "GET" &&
    (pathname === "/api/admin/session" ||
      (pathname === "/api/admin/auth" && adminAction === "session"))
  ) {
    sendJson(response, isAdminRequest(request) ? 200 : 401, {
      authenticated: isAdminRequest(request)
    });
    return true;
  }

  if (
    request.method === "POST" &&
    (pathname === "/api/admin/logout" ||
      (pathname === "/api/admin/auth" && adminAction === "logout"))
  ) {
    const sessionId = parseCookies(request).sloy198_admin_session;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    sendJson(response, 200, { authenticated: false }, {
      "Set-Cookie": "sloy198_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
    });
    return true;
  }

  if (pathname.startsWith("/api/admin/") && !isAdminRequest(request)) {
    sendJson(response, 401, { error: "Требуется вход в админ-панель." });
    return true;
  }

  if (
    request.method === "GET" &&
    (pathname === "/api/admin/schedule" ||
      (pathname === "/api/admin/booking" && adminAction === "schedule"))
  ) {
    sendJson(response, 200, { slots: await store.listAdminSchedule() });
    return true;
  }

  if (
    request.method === "POST" &&
    (pathname === "/api/admin/slots" ||
      (pathname === "/api/admin/slot" && adminAction === "slots"))
  ) {
    const slot = await store.createSlot(validateSlot(await readJsonBody(request)));
    sendJson(response, 201, { slot });
    return true;
  }

  if (
    request.method === "GET" &&
    (pathname === "/api/admin/courses" ||
      (pathname === "/api/admin/content" && adminAction === "courses"))
  ) {
    sendJson(response, 200, { courses: await store.listAdminCourses() });
    return true;
  }

  if (
    request.method === "POST" &&
    (pathname === "/api/admin/courses" ||
      (pathname === "/api/admin/content" && adminAction === "courses"))
  ) {
    const course = await store.createCourse(validateCourse(await readJsonBody(request)));
    sendJson(response, 201, { course });
    return true;
  }

  const courseMatch =
    pathname.match(/^\/api\/admin\/courses\/([^/]+)$/) ||
    (pathname === "/api/admin/content" && adminAction === "course"
      ? [pathname, requestUrl.searchParams.get("id")]
      : null);
  if (request.method === "PATCH" && courseMatch) {
    const course = await store.updateCourse(
      courseMatch[1],
      validateCourse(await readJsonBody(request), true)
    );
    sendJson(response, 200, { course });
    return true;
  }
  if (request.method === "DELETE" && courseMatch) {
    const deleted = await store.deleteCourse(courseMatch[1]);
    await deletePrivateVideos(deleted.videoPaths);
    sendJson(response, 200, deleted);
    return true;
  }

  if (
    request.method === "POST" &&
    (pathname === "/api/admin/lessons" ||
      (pathname === "/api/admin/content" && adminAction === "lessons"))
  ) {
    const lesson = await store.createLesson(validateLesson(await readJsonBody(request)));
    sendJson(response, 201, { lesson });
    return true;
  }

  const lessonMatch =
    pathname.match(/^\/api\/admin\/lessons\/([^/]+)$/) ||
    (pathname === "/api/admin/content" && adminAction === "lesson"
      ? [pathname, requestUrl.searchParams.get("id")]
      : null);
  if (request.method === "PATCH" && lessonMatch) {
    const body = await readJsonBody(request);
    if (body.direction) {
      const lesson = await store.moveLesson(lessonMatch[1], body.direction);
      sendJson(response, 200, { lesson });
      return true;
    }
    const courses = await store.listAdminCourses();
    const previous = courses.flatMap((course) => course.lessons)
      .find((lesson) => lesson.id === lessonMatch[1]);
    const lesson = await store.updateLesson(
      lessonMatch[1],
      validateLesson(body, true)
    );
    if (
      previous?.videoPath &&
      body.videoPath !== undefined &&
      previous.videoPath !== lesson.videoPath
    ) {
      await deletePrivateVideos(previous.videoPath);
    }
    sendJson(response, 200, { lesson });
    return true;
  }
  if (request.method === "DELETE" && lessonMatch) {
    const deleted = await store.deleteLesson(lessonMatch[1]);
    await deletePrivateVideos(deleted.videoPath);
    sendJson(response, 200, deleted);
    return true;
  }

  if (
    request.method === "POST" &&
    (pathname === "/api/admin/course-access" ||
      (pathname === "/api/admin/content" && adminAction === "course-access"))
  ) {
    const body = await readJsonBody(request);
    const userId = String(body.userId || "").trim();
    const courseId = String(body.courseId || "").trim();
    if (!userId || !courseId) {
      sendJson(response, 400, { error: "Укажите ID пользователя и курс." });
      return true;
    }
    sendJson(response, 200, {
      purchase: await store.grantCourseAccess(userId, courseId, "admin-test")
    });
    return true;
  }

  const slotMatch =
    pathname.match(/^\/api\/admin\/slots\/([^/]+)$/) ||
    (pathname === "/api/admin/slot" && adminAction === "slot"
      ? [pathname, requestUrl.searchParams.get("id")]
      : null);
  if (request.method === "DELETE" && slotMatch) {
    sendJson(response, 200, await store.deleteSlot(slotMatch[1]));
    return true;
  }
  if (request.method === "PATCH" && slotMatch) {
    const body = await readJsonBody(request);
    if (body.status !== "free") {
      sendJson(response, 400, { error: "Поддерживается только восстановление слота." });
      return true;
    }
    sendJson(response, 200, { slot: await store.restoreSlot(slotMatch[1]) });
    return true;
  }

  const bookingMatch =
    pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/) ||
    (pathname === "/api/admin/booking" && adminAction === "booking"
      ? [pathname, requestUrl.searchParams.get("id")]
      : null);
  if (request.method === "PATCH" && bookingMatch) {
    const body = await readJsonBody(request);
    const booking = await store.updateBookingStatus(bookingMatch[1], body.status);
    sendJson(response, 200, { booking });
    return true;
  }

  return false;
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      const handled = await handleApiRequest(request, response, pathname);
      if (!handled) {
        sendJson(response, 404, { error: "API-метод не найден." });
      }
      return;
    }

    const filePath = await resolveRequestPath(request.url || "/");

    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Страница не найдена");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.statusCode ? error.message : "Внутренняя ошибка сервера."
    });
    if (!error.statusCode) {
      console.error(error);
    }
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && activePort < requestedPort + 10) {
    activePort += 1;
    console.warn(`Порт ${activePort - 1} занят, пробую ${activePort}...`);
    setTimeout(() => server.listen(activePort, host), 50);
    return;
  }

  throw error;
});

server.on("listening", () => {
  const localUrl = `http://localhost:${activePort}`;
  const lanAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${activePort}`);

  console.log(`\nSLOY198 dev server`);
  console.log(`Local:   ${localUrl}`);
  lanAddresses.forEach((address) => console.log(`Network: ${address}`));
  console.log(`Admin:   ${localUrl}/admin`);
  if (!process.env.ADMIN_LOGIN && !process.env.ADMIN_PASSWORD) {
    console.log("Временный вход: admin / sloy198-change-me");
    console.log("Для смены задайте ADMIN_LOGIN и ADMIN_PASSWORD перед запуском.");
  }
  console.log("\nОткройте Network-адрес на телефоне в той же Wi-Fi сети.\n");
});

await store.init();
server.listen(activePort, host);
