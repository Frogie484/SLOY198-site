import { ensureEducationIdentity } from "../../server/vercel/education-session.js";
import { isPublicTestAccessEnabled } from "../../server/vercel/education-access.js";
import { getEducationStore } from "../../server/vercel/education-store.js";
import { createApiHandler, sendJson } from "../../server/vercel/http.js";

export default createApiHandler(["GET"], async (request, response) => {
  const identity = ensureEducationIdentity(request);
  const store = await getEducationStore();
  sendJson(response, 200, {
    userId: identity.user.id,
    testAccessEnabled: isPublicTestAccessEnabled(),
    courses: await store.listCatalog(identity.user.id)
  }, identity.cookie
    ? { "Set-Cookie": identity.cookie }
    : {});
});
