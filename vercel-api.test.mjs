import assert from "node:assert/strict";
import test from "node:test";
import { ScheduleStore } from "./schedule-store.mjs";
import authHandler from "./api/admin/auth.js";
import slotAdminHandler from "./api/admin/slot.js";
import bookingAdminHandler from "./api/admin/booking.js";
import slotsHandler from "./api/slots.js";
import bookingsHandler from "./api/bookings.js";
import { setScheduleStoreForTests } from "./server/vercel/store.js";

class MemoryAdapter {
  constructor() {
    this.database = { version: 2, slots: [], bookings: [] };
  }

  async init() {}

  async read() {
    return structuredClone(this.database);
  }

  async write(database) {
    this.database = structuredClone(database);
  }
}

const createRequest = ({
  method,
  url,
  body,
  cookie = "",
  query = {},
  forwardedProtocol = "https"
}) => ({
  method,
  url,
  body,
  query,
  headers: {
    cookie,
    "x-forwarded-proto": forwardedProtocol
  }
});

const createResponse = () => {
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

const call = async (handler, request) => {
  const response = createResponse();
  await handler(request, response);
  return response;
};

test("Vercel API supports login, schedule management, booking and logout", async () => {
  delete process.env.ADMIN_LOGIN;
  delete process.env.ADMIN_PASSWORD;
  process.env.VERCEL = "1";

  const store = new ScheduleStore(new MemoryAdapter());
  await store.init();
  setScheduleStoreForTests(store);

  const denied = await call(
    bookingAdminHandler,
    createRequest({
      method: "GET",
      url: "/api/admin/booking?action=schedule",
      query: { action: "schedule" }
    })
  );
  assert.equal(denied.statusCode, 401);

  const login = await call(
    authHandler,
    createRequest({
      method: "POST",
      url: "/api/admin/auth?action=login",
      query: { action: "login" },
      body: { login: "admin", password: "sloy198-change-me" }
    })
  );
  assert.equal(login.statusCode, 200);
  const setCookie = login.getHeader("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(";")[0];

  const session = await call(
    authHandler,
    createRequest({
      method: "GET",
      url: "/api/admin/auth?action=session",
      query: { action: "session" },
      cookie
    })
  );
  assert.deepEqual(session.json(), { authenticated: true });

  for (const time of ["12:20", "12:30", "12:40", "13:00"]) {
    const created = await call(
      slotAdminHandler,
      createRequest({
        method: "POST",
        url: "/api/admin/slot?action=slots",
        query: { action: "slots" },
        cookie,
        body: {
          date: "2099-06-14",
          time,
          duration: 30,
          type: "Консультация"
        }
      })
    );
    assert.equal(created.statusCode, 201);
  }

  const publicSlots = await call(
    slotsHandler,
    createRequest({ method: "GET", url: "/api/slots" })
  );
  const selectedSlot = publicSlots.json().slots.find((slot) => slot.time === "12:30");

  const booked = await call(
    bookingsHandler,
    createRequest({
      method: "POST",
      url: "/api/bookings",
      body: {
        slotId: selectedSlot.id,
        name: "Клиент",
        phone: "+70000000000",
        telegram: "@client",
        birthDate: "1990-01-01",
        comment: "Тест"
      }
    })
  );
  assert.equal(booked.statusCode, 201);
  const bookingId = booked.json().booking.id;

  const adminSchedule = await call(
    bookingAdminHandler,
    createRequest({
      method: "GET",
      url: "/api/admin/booking?action=schedule",
      query: { action: "schedule" },
      cookie
    })
  );
  assert.deepEqual(
    adminSchedule.json().slots.map((slot) => [slot.time, slot.status]),
    [
      ["12:20", "unavailable"],
      ["12:30", "booked"],
      ["12:40", "unavailable"],
      ["13:00", "free"]
    ]
  );
  assert.equal(
    adminSchedule.json().slots.find((slot) => slot.time === "12:30").booking.client.name,
    "Клиент"
  );

  const confirmed = await call(
    bookingAdminHandler,
    createRequest({
      method: "PATCH",
      url: `/api/admin/booking?action=booking&id=${bookingId}`,
      query: { action: "booking", id: bookingId },
      cookie,
      body: { status: "confirmed" }
    })
  );
  assert.equal(confirmed.json().booking.status, "confirmed");

  const freeSlotId = adminSchedule.json().slots.find((slot) => slot.time === "13:00").id;
  const deleted = await call(
    slotAdminHandler,
    createRequest({
      method: "DELETE",
      url: `/api/admin/slot?action=slot&id=${freeSlotId}`,
      query: { action: "slot", id: freeSlotId },
      cookie
    })
  );
  assert.equal(deleted.statusCode, 200);

  const logout = await call(
    authHandler,
    createRequest({
      method: "POST",
      url: "/api/admin/auth?action=logout",
      query: { action: "logout" },
      cookie
    })
  );
  assert.equal(logout.statusCode, 200);
  assert.match(logout.getHeader("set-cookie"), /Max-Age=0/);
});
