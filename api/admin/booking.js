import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["GET", "PATCH"], async (request, response) => {
  const action = getAction(request);
  const store = await getScheduleStore();

  if (action === "schedule" && request.method === "GET") {
    sendJson(response, 200, { slots: await store.listAdminSchedule() });
    return;
  }

  if (action === "booking" && request.method === "PATCH") {
    const bookingId = getRouteId(request);
    if (!bookingId) {
      throw createHttpError("Не указан идентификатор записи.", 400);
    }
    const body = await readJsonBody(request);
    const booking = await store.updateBookingStatus(bookingId, body.status);
    sendJson(response, 200, { booking });
    return;
  }

  throw createHttpError("Метод управления записями не найден.", 404);
}, { requireAdmin: true });

const getAction = (request) =>
  String(
    request.query?.action ||
    new URL(request.url || "/", "http://localhost").searchParams.get("action") ||
    "booking"
  );
