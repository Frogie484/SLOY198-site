import { ensureEducationIdentity } from "../../server/vercel/education-session.js";
import { isPublicTestAccessEnabled } from "../../server/vercel/education-access.js";
import { createApiHandler, sendJson } from "../../server/vercel/http.js";
import { getScheduleStore } from "../../server/vercel/store.js";

export default createApiHandler(["GET"], async (request, response) => {
  const identity = ensureEducationIdentity(request);
  const store = await getScheduleStore();
  await store.ensureEducationUser(identity.user.id);
  const courses = await store.listEducationCatalog(identity.user.id);
  sendJson(response, 200, {
    userId: identity.user.id,
    courses,
    testAccessEnabled: isPublicTestAccessEnabled()
  }, identity.cookie
    ? { "Set-Cookie": identity.cookie }
    : {});
});
