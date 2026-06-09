import { ensureEducationIdentity } from "../../server/vercel/education-session.js";
import { isPublicTestAccessEnabled } from "../../server/vercel/education-access.js";
import {
  createApiHandler,
  createHttpError,
  readJsonBody,
  sendJson
} from "../../server/vercel/http.js";
import { getEducationStore } from "../../server/vercel/education-store.js";

export default createApiHandler(["POST"], async (request, response) => {
  if (!isPublicTestAccessEnabled()) {
    throw createHttpError("Тестовый доступ отключён.", 403);
  }
  const identity = ensureEducationIdentity(request);
  const body = await readJsonBody(request);
  const store = await getEducationStore();
  await store.ensureUser(identity.user.id);
  const purchase = await store.grantCourseAccess(
    identity.user.id,
    String(body.courseId || "").trim(),
    "test"
  );
  sendJson(response, 200, { purchase }, identity.cookie
    ? { "Set-Cookie": identity.cookie }
    : {});
});
