import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ScheduleStore } from "./schedule-store.mjs";
import { slotsOverlap } from "./slot-time.js";

const createStore = async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "sloy198-schedule-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ScheduleStore(join(directory, "schedule.json"));
  await store.init();
  return store;
};

const slot = (time, duration, date = "2099-06-14") => ({ date, time, duration });

test("slotsOverlap follows strict interval boundaries for every duration", () => {
  assert.equal(slotsOverlap(slot("12:20", 30), slot("12:30", 30)), true);
  assert.equal(slotsOverlap(slot("12:40", 30), slot("12:30", 30)), true);
  assert.equal(slotsOverlap(slot("13:00", 30), slot("12:30", 30)), false);
  assert.equal(slotsOverlap(slot("11:45", 45), slot("12:30", 60)), false);
  assert.equal(slotsOverlap(slot("12:00", 90), slot("13:00", 45)), true);
  assert.equal(slotsOverlap(slot("12:30", 60), slot("12:30", 30, "2099-06-15")), false);
});

test("admin can create overlapping slots and public list hides conflicts after booking", async (context) => {
  const store = await createStore(context);
  const slots = [];

  for (const time of ["12:20", "12:30", "12:40", "13:00"]) {
    slots.push(await store.createSlot({ ...slot(time, 30), type: "Консультация" }));
  }

  await store.createBooking({
    slotId: slots[1].id,
    name: "Клиент",
    phone: "+70000000000",
    telegram: "@client"
  });

  const adminSchedule = await store.listAdminSchedule();
  assert.deepEqual(
    adminSchedule.map((item) => [item.time, item.status]),
    [
      ["12:20", "unavailable"],
      ["12:30", "booked"],
      ["12:40", "unavailable"],
      ["13:00", "free"]
    ]
  );
  const available = await store.listAvailableSlots();
  assert.deepEqual(available.map((item) => item.time), ["13:00"]);
});

test("overlapping booking is rejected atomically while boundary slot stays bookable", async (context) => {
  const store = await createStore(context);
  const booked = await store.createSlot({
    ...slot("12:30", 30),
    type: "Консультация"
  });
  const overlapping = await store.createSlot({
    ...slot("12:40", 90),
    type: "Консультация"
  });
  const boundary = await store.createSlot({
    ...slot("13:00", 45),
    type: "Консультация"
  });
  const client = {
    name: "Клиент",
    phone: "+70000000000",
    telegram: "@client"
  };

  await store.createBooking({ ...client, slotId: booked.id });
  await assert.rejects(
    store.createBooking({ ...client, slotId: overlapping.id }),
    (error) => error.statusCode === 409
  );
  await assert.doesNotReject(store.createBooking({ ...client, slotId: boundary.id }));
});

test("unavailable slots stay stored and can be restored only after cancellation", async (context) => {
  const store = await createStore(context);
  const overlapping = await store.createSlot({
    ...slot("12:20", 30),
    type: "Консультация"
  });
  const selected = await store.createSlot({
    ...slot("12:30", 30),
    type: "Консультация"
  });
  const { booking } = await store.createBooking({
    slotId: selected.id,
    name: "Клиент",
    phone: "+70000000000",
    telegram: "@client"
  });

  await assert.rejects(store.restoreSlot(overlapping.id), (error) => error.statusCode === 409);
  await store.updateBookingStatus(booking.id, "cancelled");

  const beforeRestore = await store.listAdminSchedule();
  assert.equal(beforeRestore.find((item) => item.id === overlapping.id).status, "unavailable");
  assert.equal(beforeRestore.find((item) => item.id === selected.id).status, "cancelled");

  await store.restoreSlot(overlapping.id);
  const afterRestore = await store.listAvailableSlots();
  assert.deepEqual(afterRestore.map((item) => item.time), ["12:20"]);
});

test("slot added over an existing booking is stored as unavailable", async (context) => {
  const store = await createStore(context);
  const selected = await store.createSlot({
    ...slot("12:30", 60),
    type: "Консультация"
  });
  await store.createBooking({
    slotId: selected.id,
    name: "Клиент",
    phone: "+70000000000",
    telegram: "@client"
  });

  const addedLater = await store.createSlot({
    ...slot("13:00", 30),
    type: "Консультация"
  });
  assert.equal(addedLater.status, "unavailable");
});
