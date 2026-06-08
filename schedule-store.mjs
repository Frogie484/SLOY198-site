import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { slotsOverlap } from "./slot-time.js";

export const BOOKING_STATUSES = ["new", "confirmed", "cancelled", "completed"];
export const SLOT_STATUSES = ["free", "booked", "unavailable", "cancelled"];

const emptyDatabase = {
  version: 3,
  storage: {
    revision: 0,
    updatedAt: "",
    mutationId: "",
    appliedMutationIds: []
  },
  slots: [],
  bookings: [],
  users: [],
  purchases: [],
  courses: [],
  lessons: []
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

  async listEducationCatalog(userId = "") {
    const database = await this.read();
    const accessibleCourseIds = getAccessibleCourseIds(database, userId);

    return database.courses
      .filter((course) => course.status === "published")
      .sort(compareCreated)
      .map((course) => ({
        ...course,
        hasAccess: accessibleCourseIds.has(course.id),
        lessons: database.lessons
          .filter((lesson) => lesson.courseId === course.id && lesson.published)
          .sort(compareLessons)
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            createdAt: lesson.createdAt,
            order: lesson.order,
            published: lesson.published,
            videoAvailable: Boolean(lesson.videoPath)
          }))
      }));
  }

  async listAdminCourses() {
    const database = await this.read();

    return database.courses
      .sort(compareCreated)
      .map((course) => ({
        ...course,
        lessons: database.lessons
          .filter((lesson) => lesson.courseId === course.id)
          .sort(compareLessons)
      }));
  }

  createCourse(input) {
    return this.mutate((database) => {
      const now = new Date().toISOString();
      const course = {
        id: randomUUID(),
        title: input.title,
        description: input.description || "",
        previewImageUrl: input.previewImageUrl || "",
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
        throw createStoreError("Курс не найден.", 404);
      }

      for (const field of ["title", "description", "previewImageUrl"]) {
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
        throw createStoreError("Курс не найден.", 404);
      }

      const videoPaths = database.lessons
        .filter((lesson) => lesson.courseId === courseId && lesson.videoPath)
        .map((lesson) => lesson.videoPath);
      database.courses.splice(courseIndex, 1);
      database.lessons = database.lessons.filter((lesson) => lesson.courseId !== courseId);
      database.purchases = database.purchases.filter((purchase) => purchase.courseId !== courseId);
      return { id: courseId, videoPaths };
    });
  }

  createLesson(input) {
    return this.mutate((database) => {
      if (!database.courses.some((course) => course.id === input.courseId)) {
        throw createStoreError("Курс не найден.", 404);
      }

      const courseLessons = database.lessons.filter(
        (lesson) => lesson.courseId === input.courseId
      );
      const now = new Date().toISOString();
      const lesson = {
        id: randomUUID(),
        courseId: input.courseId,
        title: input.title,
        description: input.description || "",
        videoPath: input.videoPath || "",
        createdAt: now,
        updatedAt: now,
        order: Number.isInteger(input.order) ? input.order : courseLessons.length + 1,
        published: Boolean(input.published)
      };
      database.lessons.push(lesson);
      normalizeLessonOrder(database, input.courseId);
      return lesson;
    });
  }

  updateLesson(lessonId, input) {
    return this.mutate((database) => {
      const lesson = database.lessons.find((item) => item.id === lessonId);
      if (!lesson) {
        throw createStoreError("Урок не найден.", 404);
      }

      for (const field of ["title", "description", "videoPath"]) {
        if (input[field] !== undefined) {
          lesson[field] = String(input[field]).trim();
        }
      }
      if (input.published !== undefined) {
        lesson.published = Boolean(input.published);
      }
      if (input.order !== undefined) {
        lesson.order = Math.max(1, Number(input.order) || 1);
      }
      lesson.updatedAt = new Date().toISOString();
      normalizeLessonOrder(database, lesson.courseId);
      return lesson;
    });
  }

  deleteLesson(lessonId) {
    return this.mutate((database) => {
      const lessonIndex = database.lessons.findIndex((item) => item.id === lessonId);
      if (lessonIndex === -1) {
        throw createStoreError("Урок не найден.", 404);
      }
      const [lesson] = database.lessons.splice(lessonIndex, 1);
      normalizeLessonOrder(database, lesson.courseId);
      return { id: lessonId, videoPath: lesson.videoPath };
    });
  }

  moveLesson(lessonId, direction) {
    return this.mutate((database) => {
      const lesson = database.lessons.find((item) => item.id === lessonId);
      if (!lesson) {
        throw createStoreError("Урок не найден.", 404);
      }

      const lessons = database.lessons
        .filter((item) => item.courseId === lesson.courseId)
        .sort(compareLessons);
      const currentIndex = lessons.findIndex((item) => item.id === lessonId);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= lessons.length) {
        return lesson;
      }

      const target = lessons[targetIndex];
      [lesson.order, target.order] = [target.order, lesson.order];
      lesson.updatedAt = new Date().toISOString();
      target.updatedAt = lesson.updatedAt;
      normalizeLessonOrder(database, lesson.courseId);
      return lesson;
    });
  }

  ensureEducationUser(userId) {
    return this.mutate((database) => {
      let user = database.users.find((item) => item.id === userId);
      if (!user) {
        const now = new Date().toISOString();
        user = {
          id: userId,
          name: "",
          email: "",
          createdAt: now,
          updatedAt: now
        };
        database.users.push(user);
      }
      return user;
    });
  }

  grantCourseAccess(userId, courseId, provider = "test") {
    return this.mutate((database) => {
      if (!database.courses.some((course) => course.id === courseId)) {
        throw createStoreError("Курс не найден.", 404);
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

      const course = database.courses.find((item) => item.id === courseId);
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

  async getLessonWithAccess(userId, lessonId) {
    const database = await this.read();
    const lesson = database.lessons.find((item) => item.id === lessonId);
    if (!lesson || !lesson.published) {
      throw createStoreError("Урок не найден.", 404);
    }
    if (!getAccessibleCourseIds(database, userId).has(lesson.courseId)) {
      throw createStoreError("Для просмотра урока требуется доступ к курсу.", 403);
    }
    if (!lesson.videoPath) {
      throw createStoreError("Видео для этого урока ещё не загружено.", 404);
    }
    return lesson;
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

const compareCreated = (left, right) =>
  String(left.createdAt).localeCompare(String(right.createdAt));

const compareLessons = (left, right) =>
  Number(left.order) - Number(right.order) ||
  String(left.createdAt).localeCompare(String(right.createdAt));

const normalizeLessonOrder = (database, courseId) => {
  database.lessons
    .filter((lesson) => lesson.courseId === courseId)
    .sort(compareLessons)
    .forEach((lesson, index) => {
      lesson.order = index + 1;
    });
};

const getAccessibleCourseIds = (database, userId) =>
  new Set(
    database.purchases
      .filter((purchase) => purchase.userId === userId && purchase.status === "paid")
      .map((purchase) => purchase.courseId)
  );

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
  database.version = 3;
  database.storage = {
    revision: Math.max(0, Number(database.storage?.revision) || 0),
    updatedAt: String(database.storage?.updatedAt || ""),
    mutationId: String(database.storage?.mutationId || ""),
    appliedMutationIds: Array.isArray(database.storage?.appliedMutationIds)
      ? database.storage.appliedMutationIds.map(String).slice(-50)
      : []
  };
  database.slots = Array.isArray(database.slots) ? database.slots : [];
  database.bookings = Array.isArray(database.bookings) ? database.bookings : [];
  database.users = Array.isArray(database.users) ? database.users : [];
  database.purchases = Array.isArray(database.purchases) ? database.purchases : [];
  database.courses = Array.isArray(database.courses) ? database.courses : [];
  database.lessons = Array.isArray(database.lessons) ? database.lessons : [];
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

  database.courses.forEach((course) => {
    course.description = course.description || "";
    course.previewImageUrl = course.previewImageUrl || "";
    course.price = Number(course.price) || 0;
    course.status = course.status === "published" ? "published" : "draft";
    course.createdAt = course.createdAt || new Date().toISOString();
    course.updatedAt = course.updatedAt || course.createdAt;
  });
  database.lessons.forEach((lesson) => {
    lesson.description = lesson.description || "";
    lesson.videoPath = lesson.videoPath || "";
    lesson.createdAt = lesson.createdAt || new Date().toISOString();
    lesson.updatedAt = lesson.updatedAt || lesson.createdAt;
    lesson.order = Number(lesson.order) || 1;
    lesson.published = Boolean(lesson.published);
  });
  database.courses.forEach((course) => normalizeLessonOrder(database, course.id));
};

const cloneEmptyDatabase = () => structuredClone(emptyDatabase);

export const createStoreError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};
