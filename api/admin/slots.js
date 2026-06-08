import { createApiHandler, readJsonBody, sendJson } from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";
import { validateSlot } from "../../server/vercel/validation.js";

export default createApiHandler(["POST"], async (request, response) => {
  const store = await getScheduleStore();
  const slot = await store.createSlot(validateSlot(await readJsonBody(request)));
  sendJson(response, 201, { slot });
}, { requireAdmin: true });
