import { createApiHandler, sendJson } from "../../server/vercel/http.js";
import { clearSessionCookie } from "../../server/vercel/session.js";

export default createApiHandler(["POST"], async (request, response) => {
  sendJson(response, 200, { authenticated: false }, {
    "Set-Cookie": clearSessionCookie(request)
  });
});
