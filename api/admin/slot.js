import {
  createApiHandler,
  createHttpError,
  getRouteId,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";
import { validateSlot } from "../../server/vercel/validation.js";

export default createApiHandler(["POST", "PATCH", "DELETE"], async (request, response) => {
  const action = getAction(request);
  const store = await getScheduleStore();

  if (action === "slots" && request.method === "POST") {
    const slot = await store.createSlot(validateSlot(await readJsonBody(request)));
    sendJson(response, 201, { slot });
    return;
  }

  if (action === "slot") {
    const slotId = getRouteId(request);
    if (!slotId) {
      throw createHttpError("Не указан идентификатор слота.", 400);
    }
    if (request.method === "DELETE") {
      sendJson(response, 200, await store.deleteSlot(slotId));
      return;
    }
    if (request.method === "PATCH") {
      const body = await readJsonBody(request);
      if (body.status !== "free") {
        throw createHttpError("Поддерживается только восстановление слота.", 400);
      }
      sendJson(response, 200, { slot: await store.restoreSlot(slotId) });
      return;
    }
  }

  throw createHttpError("Метод управления слотами не найден.", 404);
}, { requireAdmin: true });

const getAction = (request) =>
  String(
    request.query?.action ||
    new URL(request.url || "/", "http://localhost").searchParams.get("action") ||
    "slot"
  );
