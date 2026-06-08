import { randomUUID } from "node:crypto";

export const YOOKASSA_PROVIDER = "yookassa";

export const isYooKassaConfigured = () =>
  Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);

export const createYooKassaPayment = async ({
  purchase,
  course,
  returnUrl,
  fetchImpl = fetch
}) => {
  if (!isYooKassaConfigured()) {
    const error = new Error("ЮKassa пока не подключена.");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetchImpl("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
      ).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotence-Key": randomUUID()
    },
    body: JSON.stringify({
      amount: {
        value: Number(course.price).toFixed(2),
        currency: purchase.currency || "RUB"
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: returnUrl
      },
      description: `Курс «${course.title}»`,
      metadata: {
        purchaseId: purchase.id,
        courseId: course.id,
        userId: purchase.userId
      }
    })
  });

  const payment = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payment.description || "Не удалось создать платёж ЮKassa.");
    error.statusCode = 502;
    throw error;
  }
  return payment;
};
