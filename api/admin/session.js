import { createApiHandler, sendJson } from "../../server/vercel/http.js";
import { isAdminRequest } from "../../server/vercel/session.js";

export default createApiHandler(["GET"], async (request, response) => {
  const authenticated = isAdminRequest(request);
  sendJson(response, authenticated ? 200 : 401, { authenticated });
});
