import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["PATCH", "DELETE"], async (request, response) => {
  const slotId = getRouteId(request);
  if (!slotId) {
    throw createHttpError("Не указан идентификатор слота.", 400);
  }

  const store = await getScheduleStore();
  if (request.method === "DELETE") {
    sendJson(response, 200, await store.deleteSlot(slotId));
    return;
  }

  const body = await readJsonBody(request);
  if (body.status !== "free") {
    throw createHttpError("Поддерживается только восстановление слота.", 400);
  }

  sendJson(response, 200, { slot: await store.restoreSlot(slotId) });
}, { requireAdmin: true });
