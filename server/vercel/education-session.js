import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getAdminCredentials } from "./session.js";

const COOKIE_NAME = "sloy198_education_user";
const SESSION_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

export const getEducationUser = (request) => {
  const token = parseCookies(request)[COOKIE_NAME];
  if (!token) {
    return null;
  }

  const [userId, signature] = token.split(".");
  if (!userId || !signature || !safeEqual(signature, sign(userId))) {
    return null;
  }

  return { id: userId };
};

export const ensureEducationIdentity = (request) => {
  const existing = getEducationUser(request);
  if (existing) {
    return { user: existing, cookie: "" };
  }

  const user = { id: randomUUID() };
  return {
    user,
    cookie: serializeCookie(`${user.id}.${sign(user.id)}`, request)
  };
};

const sign = (userId) => {
  const credentials = getAdminCredentials();
  const secret =
    process.env.EDUCATION_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    credentials.password;
  return createHmac("sha256", secret).update(userId).digest("base64url");
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

const serializeCookie = (value, request) => {
  const forwardedProtocol = String(request.headers["x-forwarded-proto"] || "");
  const secure = process.env.VERCEL === "1" || forwardedProtocol === "https";
  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${SESSION_LIFETIME_SECONDS}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
};
