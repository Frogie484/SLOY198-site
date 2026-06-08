import { createApiHandler, readJsonBody, sendJson } from "../server/vercel/http.js";
import { getScheduleStore } from "../server/vercel/store.js";
import { validateBooking } from "../server/vercel/validation.js";

export default createApiHandler(["POST"], async (request, response) => {
  const store = await getScheduleStore();
  const booking = validateBooking(await readJsonBody(request));
  sendJson(response, 201, await store.createBooking(booking));
});
