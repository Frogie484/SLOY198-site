const educationApi = window.SLOY198ScheduleApi;
const catalogElement = document.querySelector("[data-course-catalog]");
const identityElement = document.querySelector("[data-education-identity]");
const userIdElement = document.querySelector("[data-education-user-id]");
const playerSection = document.querySelector("[data-player-section]");
const player = document.querySelector("[data-course-player]");
const playerTitle = document.querySelector("[data-player-title]");
const playerDescription = document.querySelector("[data-player-description]");
const playerStatus = document.querySelector("[data-player-status]");

const formatPrice = (price) =>
  price > 0
    ? new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0
    }).format(price)
    : "Бесплатно";

const createElement = (tagName, className, text = "") => {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
};

const createLesson = (lesson, course) => {
  const item = createElement("li", "course-lesson");
  const number = createElement("span", "course-lesson__number", String(lesson.order).padStart(2, "0"));
  const copy = createElement("div", "course-lesson__copy");
  copy.append(
    createElement("strong", "", lesson.title),
    createElement("p", "", lesson.description || "Описание урока скоро появится.")
  );
  const action = createElement(
    "button",
    "course-lesson__action",
    course.hasAccess ? (lesson.videoAvailable ? "Смотреть" : "Видео готовится") : "Закрыто"
  );
  action.type = "button";
  action.disabled = !course.hasAccess || !lesson.videoAvailable;
  if (!action.disabled) {
    action.dataset.lessonId = lesson.id;
    action.dataset.lessonTitle = lesson.title;
    action.dataset.lessonDescription = lesson.description || "";
  }
  item.append(number, copy, action);
  return item;
};

const createCourseCard = (course, index, testAccessEnabled) => {
  const article = createElement("article", "course-card reveal");
  const preview = createElement("div", "course-card__preview");
  if (course.previewImageUrl) {
    preview.style.backgroundImage =
      `linear-gradient(180deg, rgba(5, 19, 27, 0.08), rgba(5, 19, 27, 0.84)), url("${course.previewImageUrl}")`;
  }
  preview.append(
    createElement("span", "course-card__index", String(index + 1).padStart(2, "0")),
    createElement("span", "course-card__access", course.hasAccess ? "Доступ открыт" : "Видеокурс")
  );

  const content = createElement("div", "course-card__content");
  const head = createElement("div", "course-card__head");
  const heading = createElement("div", "");
  heading.append(
    createElement("p", "course-card__label", "Самостоятельный формат"),
    createElement("h2", "", course.title)
  );
  head.append(heading, createElement("strong", "course-card__price", formatPrice(course.price)));
  content.append(head, createElement("p", "course-card__description", course.description));

  const lessonsTitle = createElement(
    "p",
    "course-card__lessons-title",
    `Уроки · ${course.lessons.length}`
  );
  const lessons = createElement("ol", "course-lessons");
  course.lessons.forEach((lesson) => lessons.append(createLesson(lesson, course)));
  content.append(lessonsTitle, lessons);

  if (!course.hasAccess && testAccessEnabled) {
    const access = createElement("div", "course-card__access-actions");
    const testButton = createElement("button", "button", "Получить тестовый доступ");
    testButton.type = "button";
    testButton.dataset.testAccess = course.id;
    access.append(
      testButton,
      createElement("small", "", "Режим разработки до подключения ЮKassa")
    );
    content.append(access);
  }

  article.append(preview, content);
  return article;
};

const renderCatalog = ({ userId, courses, testAccessEnabled }) => {
  userIdElement.textContent = userId;
  identityElement.hidden = false;
  catalogElement.replaceChildren();
  if (courses.length === 0) {
    catalogElement.append(
      createElement("p", "education-state", "Опубликованных видеокурсов пока нет.")
    );
    return;
  }
  courses.forEach((course, index) => {
    catalogElement.append(createCourseCard(course, index, testAccessEnabled));
  });
};

const loadCatalog = async () => {
  try {
    renderCatalog(await educationApi.getEducationCatalog());
  } catch (error) {
    catalogElement.replaceChildren(
      createElement("p", "education-state education-state--error", error.message)
    );
  }
};

catalogElement.addEventListener("click", async (event) => {
  const accessButton = event.target.closest("[data-test-access]");
  if (accessButton) {
    accessButton.disabled = true;
    accessButton.textContent = "Открываем доступ...";
    try {
      await educationApi.grantOwnTestAccess(accessButton.dataset.testAccess);
      await loadCatalog();
    } catch (error) {
      accessButton.disabled = false;
      accessButton.textContent = error.message;
    }
    return;
  }

  const lessonButton = event.target.closest("[data-lesson-id]");
  if (!lessonButton) {
    return;
  }
  lessonButton.disabled = true;
  playerStatus.textContent = "Подготавливаем защищённое видео...";
  playerSection.hidden = false;
  playerTitle.textContent = lessonButton.dataset.lessonTitle;
  playerDescription.textContent =
    lessonButton.dataset.lessonDescription || "Описание урока скоро появится.";
  player.removeAttribute("src");
  player.load();
  playerSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const { url } = await educationApi.getLessonVideo(lessonButton.dataset.lessonId);
    player.src = url;
    playerStatus.textContent = "";
    await player.play().catch(() => {});
  } catch (error) {
    playerStatus.textContent = error.message;
  } finally {
    lessonButton.disabled = false;
  }
});

loadCatalog();
