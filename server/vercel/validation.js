import { createHttpError } from "./http.js";

export const validateSlot = (body) => {
  const duration = Number(body.duration);
  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "");
  const timeIsValid = /^\d{2}:\d{2}$/.test(body.time || "");
  const type = String(body.type || "").trim();

  if (!dateIsValid || !timeIsValid || !Number.isInteger(duration) || duration < 15 || !type) {
    throw createHttpError("Заполните дату, время, длительность и тип консультации.", 400);
  }

  return { date: body.date, time: body.time, duration, type };
};

export const validateBooking = (body) => {
  const booking = {
    slotId: String(body.slotId || "").trim(),
    name: String(body.name || "").trim(),
    phone: String(body.phone || "").trim(),
    telegram: String(body.telegram || "").trim(),
    birthDate: String(body.birthDate || "").trim(),
    comment: String(body.comment || "").trim()
  };

  if (!booking.slotId || booking.name.length < 2 || booking.phone.length < 5 || !booking.telegram) {
    throw createHttpError("Выберите время и заполните имя, телефон и Telegram.", 400);
  }

  return booking;
};
