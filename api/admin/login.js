import { createApiHandler, readJsonBody, sendJson } from "../../server/vercel/http.js";
import { createSessionCookie, credentialsMatch } from "../../server/vercel/session.js";

export default createApiHandler(["POST"], async (request, response) => {
  const body = await readJsonBody(request);

  if (!credentialsMatch(body.login, body.password)) {
    sendJson(response, 401, { error: "Неверный логин или пароль." });
    return;
  }

  sendJson(response, 200, { authenticated: true }, {
    "Set-Cookie": createSessionCookie(request)
  });
});
