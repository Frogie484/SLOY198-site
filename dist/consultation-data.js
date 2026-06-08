/*
 * Future result object schema:
 * {
 *   id: "scenario-id",
 *   matches: ({ name, birthDate, day, month, year }) => true,
 *   eyebrow: "Тип консультации",
 *   title: "Заголовок результата",
 *   summary: "Краткий персональный результат",
 *   details: ["Дополнительный вывод", "Следующий вывод"]
 * }
 */
window.SLOY198_CONSULTATION_RESULTS = [];

window.SLOY198_CONSULTATION_FALLBACK = {
  eyebrow: "Предварительный результат",
  title: "Ваш запрос принят",
  summary: "Персональные сценарии находятся в подготовке. Интерфейс результата уже готов и автоматически покажет подходящий разбор после наполнения базы.",
  details: []
};
