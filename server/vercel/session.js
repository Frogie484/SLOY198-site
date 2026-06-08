import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "sloy198_admin_session";
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

export const getAdminCredentials = () => ({
  login: process.env.ADMIN_LOGIN || "admin",
  password: process.env.ADMIN_PASSWORD || "sloy198-change-me"
});

export const credentialsMatch = (login, password) => {
  const credentials = getAdminCredentials();
  return safeEqual(login, credentials.login) && safeEqual(password, credentials.password);
};

export const createSessionCookie = (request) => {
  const credentials = getAdminCredentials();
  const payload = Buffer.from(JSON.stringify({
    sub: credentials.login,
    exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS
  })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  return serializeCookie(token, SESSION_LIFETIME_SECONDS, request);
};

export const clearSessionCookie = (request) =>
  serializeCookie("", 0, request);

export const isAdminRequest = (request) => {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const credentials = getAdminCredentials();
    return session.sub === credentials.login && Number(session.exp) > Date.now() / 1000;
  } catch {
    return false;
  }
};

const sign = (payload) => {
  const credentials = getAdminCredentials();
  const secret = process.env.ADMIN_SESSION_SECRET || credentials.password;
  return createHmac("sha256", secret).update(payload).digest("base64url");
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left ?? ""));
  const rightBuffer = Buffer.from(String(right ?? ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const parseCookies = (request) =>
  Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        return separator === -1
          ? [cookie, ""]
          : [cookie.slice(0, separator), decodeURIComponent(cookie.slice(separator + 1))];
      })
  );

const serializeCookie = (value, maxAge, request) => {
  const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "");
  const secure = process.env.VERCEL === "1" || forwardedProtocol === "https";
  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
};
