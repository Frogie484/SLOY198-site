export const readJsonBody = async (request) => {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body;
  }

  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      throw createHttpError("Некорректный JSON.", 400);
    }
  }

  const chunks = [];
  let totalSize = 0;

  for await (const chunk of request) {
    totalSize += chunk.length;
    if (totalSize > 1_000_000) {
      throw createHttpError("Слишком большой запрос.", 413);
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw createHttpError("Некорректный JSON.", 400);
  }
};

export const sendJson = (response, statusCode, data, headers = {}) => {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
  response.end(JSON.stringify(data));
};

export const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const createApiHandler = (methods, handler, options = {}) =>
  async (request, response) => {
    try {
      if (!methods.includes(request.method)) {
        sendJson(response, 405, { error: "Метод не поддерживается." }, {
          Allow: methods.join(", ")
        });
        return;
      }

      if (options.requireAdmin) {
        const { isAdminRequest } = await import("./session.js");
        if (!isAdminRequest(request)) {
          sendJson(response, 401, { error: "Требуется вход в админ-панель." });
          return;
        }
      }

      await handler(request, response);
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: error.statusCode
          ? error.message
          : "Внутренняя ошибка сервера."
      });

      if (!error.statusCode) {
        console.error(error);
      }
    }
  };

export const getRouteId = (request) => {
  const queryId = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
  if (queryId) {
    return String(queryId);
  }

  return new URL(request.url || "/", "http://localhost").searchParams.get("id") || "";
};
