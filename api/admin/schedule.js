import { createApiHandler, sendJson } from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["GET"], async (_request, response) => {
  const store = await getScheduleStore();
  sendJson(response, 200, { slots: await store.listAdminSchedule() });
}, { requireAdmin: true });
