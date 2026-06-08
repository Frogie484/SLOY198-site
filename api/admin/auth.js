import {
  createApiHandler,
  createHttpError,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import {
  clearSessionCookie,
  createSessionCookie,
  credentialsMatch,
  isAdminRequest
} from "../../server/vercel/session.js";

export default createApiHandler(["GET", "POST"], async (request, response) => {
  const action = getAction(request);

  if (action === "login" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (!credentialsMatch(body.login, body.password)) {
      sendJson(response, 401, { error: "Неверный логин или пароль." });
      return;
    }
    sendJson(response, 200, { authenticated: true }, {
      "Set-Cookie": createSessionCookie(request)
    });
    return;
  }

  if (action === "session" && request.method === "GET") {
    const authenticated = isAdminRequest(request);
    sendJson(response, authenticated ? 200 : 401, { authenticated });
    return;
  }

  if (action === "logout" && request.method === "POST") {
    sendJson(response, 200, { authenticated: false }, {
      "Set-Cookie": clearSessionCookie(request)
    });
    return;
  }

  throw createHttpError("Метод авторизации не найден.", 404);
});

const getAction = (request) =>
  String(
    request.query?.action ||
    new URL(request.url || "/", "http://localhost").searchParams.get("action") ||
    ""
  );
