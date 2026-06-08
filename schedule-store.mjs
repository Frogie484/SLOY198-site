import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { slotsOverlap } from "./slot-time.js";

export const BOOKING_STATUSES = ["new", "confirmed", "cancelled", "completed"];
export const SLOT_STATUSES = ["free", "booked", "unavailable", "cancelled"];

const emptyDatabase = {
  version: 2,
  slots: [],
  bookings: []
};

export class ScheduleStore {
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

  async write(database) {
    normalizeDatabase(database);
    await this.adapter.write(database);
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
      await this.write(database);
      return result;
    });

    this.mutationQueue = mutation.catch(() => {});
    return mutation;
  }

  async listAvailableSlots() {
    const database = await this.read();
    const today = new Date().toISOString().slice(0, 10);

    return database.slots
      .filter((slot) => slot.status === "free" && slot.date >= today)
      .sort(compareSlots);
  }

  async listAdminSchedule() {
    const database = await this.read();
    const bookingsById = new Map(database.bookings.map((booking) => [booking.id, booking]));
    const slotsByBookingId = new Map(
      database.slots
        .filter((slot) => slot.bookingId)
        .map((slot) => [slot.bookingId, slot])
    );

    return database.slots
      .map((slot) => ({
        ...slot,
        booking: slot.bookingId ? bookingsById.get(slot.bookingId) || null : null,
        blockedBySlots: (slot.blockedByBookingIds || [])
          .map((bookingId) => slotsByBookingId.get(bookingId))
          .filter(Boolean)
          .map((blockedBySlot) => ({
            date: blockedBySlot.date,
            time: blockedBySlot.time,
            duration: blockedBySlot.duration
          }))
      }))
      .sort(compareSlots);
  }

  createSlot(input) {
    return this.mutate((database) => {
      const overlappingBookings = getBookedSlots(database).filter((slot) =>
        slotsOverlap(input, slot)
      );
      const slot = {
        id: randomUUID(),
        date: input.date,
        time: input.time,
        duration: input.duration,
        type: input.type,
        status: overlappingBookings.length > 0 ? "unavailable" : "free",
        bookingId: null,
        blockedByBookingIds: overlappingBookings.map((item) => item.bookingId),
        createdAt: new Date().toISOString()
      };

      database.slots.push(slot);
      return slot;
    });
  }

  deleteSlot(slotId) {
    return this.mutate((database) => {
      const slotIndex = database.slots.findIndex((slot) => slot.id === slotId);
      if (slotIndex === -1) {
        throw createStoreError("Слот не найден.", 404);
      }

      if (database.slots[slotIndex].status === "booked") {
        throw createStoreError("Занятый слот нельзя удалить.", 409);
      }

      database.slots.splice(slotIndex, 1);
      return { id: slotId };
    });
  }

  createBooking(input) {
    return this.mutate((database) => {
      const slot = database.slots.find((item) => item.id === input.slotId);

      if (!slot) {
        throw createStoreError("Выбранный слот не найден.", 404);
      }

      if (slot.status !== "free" || slot.bookingId) {
        throw createStoreError("Этот слот уже занят. Выберите другое время.", 409);
      }

      const conflictingSlot = database.slots.find(
        (item) => item.id !== slot.id && item.status === "booked" && slotsOverlap(slot, item)
      );

      if (conflictingSlot) {
        throw createStoreError(
          "Это время пересекается с уже забронированной консультацией. Выберите другой слот.",
          409
        );
      }

      const booking = {
        id: randomUUID(),
        slotId: slot.id,
        client: {
          name: input.name,
          phone: input.phone,
          telegram: input.telegram,
          birthDate: input.birthDate || "",
          comment: input.comment || ""
        },
        status: "new",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      database.bookings.push(booking);
      slot.status = "booked";
      slot.bookingId = booking.id;
      slot.blockedByBookingIds = [];

      const blockedSlotIds = deactivateOverlappingSlots(database, slot, booking.id);

      return { booking, slot, blockedSlotIds };
    });
  }

  restoreSlot(slotId) {
    return this.mutate((database) => {
      const slot = database.slots.find((item) => item.id === slotId);
      if (!slot) {
        throw createStoreError("Слот не найден.", 404);
      }

      if (slot.status !== "unavailable") {
        throw createStoreError("Этот слот не требует восстановления.", 409);
      }

      const conflictingSlot = getBookedSlots(database).find(
        (item) => item.id !== slot.id && slotsOverlap(slot, item)
      );
      if (conflictingSlot) {
        throw createStoreError(
          `Слот пока пересекается с активной записью ${conflictingSlot.time}. Сначала отмените её.`,
          409
        );
      }

      slot.status = "free";
      slot.bookingId = null;
      slot.blockedByBookingIds = [];
      return slot;
    });
  }

  updateBookingStatus(bookingId, status) {
    return this.mutate((database) => {
      if (!BOOKING_STATUSES.includes(status)) {
        throw createStoreError("Неизвестный статус записи.", 400);
      }

      const booking = database.bookings.find((item) => item.id === bookingId);
      if (!booking) {
        throw createStoreError("Запись не найдена.", 404);
      }

      const slot = database.slots.find((item) => item.id === booking.slotId);
      if (!slot) {
        throw createStoreError("Связанный слот не найден.", 404);
      }

      if (status === "cancelled") {
        booking.status = status;
        booking.updatedAt = new Date().toISOString();
        if (slot.bookingId === booking.id) {
          slot.status = "cancelled";
        }
        database.slots.forEach((item) => {
          item.blockedByBookingIds = (item.blockedByBookingIds || [])
            .filter((id) => id !== booking.id);
        });
        return booking;
      }

      if (booking.status === "cancelled") {
        if (slot.bookingId !== booking.id) {
          throw createStoreError("Этот слот уже был восстановлен для новых записей.", 409);
        }

        const conflictingSlot = getBookedSlots(database).find(
          (item) => item.id !== slot.id && slotsOverlap(slot, item)
        );
        if (conflictingSlot) {
          throw createStoreError("Нельзя вернуть запись: время занято другой консультацией.", 409);
        }

        slot.status = "booked";
        deactivateOverlappingSlots(database, slot, booking.id);
      }

      booking.status = status;
      booking.updatedAt = new Date().toISOString();
      return booking;
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
    const content = await readFile(this.filePath, "utf8");
    return JSON.parse(content);
  }

  async write(database) {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

const compareSlots = (left, right) =>
  `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`);

const getBookedSlots = (database) =>
  database.slots.filter((slot) => slot.status === "booked" && slot.bookingId);

const deactivateOverlappingSlots = (database, bookedSlot, bookingId) => {
  const blockedSlotIds = [];

  database.slots.forEach((slot) => {
    if (
      slot.id === bookedSlot.id ||
      slot.status === "booked" ||
      slot.status === "cancelled" ||
      !slotsOverlap(slot, bookedSlot)
    ) {
      return;
    }

    slot.status = "unavailable";
    slot.blockedByBookingIds = [...new Set([...(slot.blockedByBookingIds || []), bookingId])];
    blockedSlotIds.push(slot.id);
  });

  return blockedSlotIds;
};

const normalizeDatabase = (database) => {
  database.version = 2;
  database.slots = Array.isArray(database.slots) ? database.slots : [];
  database.bookings = Array.isArray(database.bookings) ? database.bookings : [];
  const bookingsById = new Map(database.bookings.map((booking) => [booking.id, booking]));

  database.slots.forEach((slot) => {
    slot.blockedByBookingIds = Array.isArray(slot.blockedByBookingIds)
      ? slot.blockedByBookingIds
      : [];

    const booking = slot.bookingId ? bookingsById.get(slot.bookingId) : null;
    if (booking?.status === "cancelled") {
      slot.status = "cancelled";
    } else if (booking) {
      slot.status = "booked";
    } else if (!SLOT_STATUSES.includes(slot.status) || slot.status === "booked") {
      slot.status = "free";
      slot.bookingId = null;
    }
  });

  getBookedSlots(database).forEach((bookedSlot) => {
    deactivateOverlappingSlots(database, bookedSlot, bookedSlot.bookingId);
  });
};

const cloneEmptyDatabase = () => structuredClone(emptyDatabase);

export const createStoreError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};
