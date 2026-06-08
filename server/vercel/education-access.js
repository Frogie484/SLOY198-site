export const isPublicTestAccessEnabled = () =>
  process.env.VERCEL_ENV !== "production" ||
  process.env.ENABLE_TEST_COURSE_ACCESS === "true";
