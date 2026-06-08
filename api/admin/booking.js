import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["PATCH"], async (request, response) => {
  const bookingId = getRouteId(request);
  if (!bookingId) {
    throw createHttpError("Не указан идентификатор записи.", 400);
  }

  const body = await readJsonBody(request);
  const store = await getScheduleStore();
  const booking = await store.updateBookingStatus(bookingId, body.status);
  sendJson(response, 200, { booking });
}, { requireAdmin: true });
