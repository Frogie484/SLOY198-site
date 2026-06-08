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

const getEmbedUrl = (value) => {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const videoId = url.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{6,}$/.test(videoId)
        ? `https://www.youtube.com/embed/${videoId}`
        : "";
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = url.pathname.startsWith("/embed/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v");
      return /^[a-zA-Z0-9_-]{6,}$/.test(videoId || "")
        ? `https://www.youtube.com/embed/${videoId}`
        : "";
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean).pop();
      return /^\d+$/.test(videoId || "") ? `https://player.vimeo.com/video/${videoId}` : "";
    }
  } catch (error) {
    return "";
  }
  return "";
};

const createCourseMedia = (course) => {
  const media = createElement("div", "education-course__media");
  const externalVideo = getEmbedUrl(
    course.videoUrl || course.previewVideoUrl || course.previewImageUrl
  );
  const availableVideos = course.lessons.filter((lesson) => lesson.videoAvailable).length;

  if (externalVideo) {
    const frame = document.createElement("iframe");
    frame.src = externalVideo;
    frame.title = `Превью курса «${course.title}»`;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    frame.allowFullscreen = true;
    media.append(frame);
    return media;
  }

  if (course.previewImageUrl && !getEmbedUrl(course.previewImageUrl)) {
    const image = document.createElement("img");
    image.src = course.previewImageUrl;
    image.alt = `Превью курса «${course.title}»`;
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    media.append(image);
  }

  const state = createElement(
    "span",
    "education-course__media-state",
    availableVideos > 0
      ? `Видеоуроков в программе · ${availableVideos}`
      : "Видео пока не добавлено"
  );
  media.append(state);
  return media;
};

const createLesson = (lesson, course) => {
  const item = createElement("li", "education-course__lesson");
  const number = createElement(
    "span",
    "education-course__lesson-number",
    String(lesson.order).padStart(2, "0")
  );
  const copy = createElement("div", "education-course__lesson-copy");
  copy.append(
    createElement("strong", "", lesson.title),
    createElement("p", "", lesson.description || "Описание урока скоро появится.")
  );
  const action = createElement(
    "button",
    "education-course__lesson-action",
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
  const article = createElement("article", "education-course");
  const content = createElement("div", "education-course__content");
  const meta = createElement("div", "education-course__meta");
  meta.append(
    createElement(
      "span",
      "education-course__access",
      course.hasAccess ? "Доступ открыт" : `Видеокурс · ${String(index + 1).padStart(2, "0")}`
    ),
    createElement("strong", "education-course__price", formatPrice(course.price))
  );
  content.append(
    meta,
    createElement("h3", "", course.title),
    createElement(
      "p",
      "education-course__description",
      course.description || "Описание курса скоро появится."
    )
  );

  const lessonsTitle = createElement(
    "p",
    "education-course__lessons-title",
    `Уроки · ${course.lessons.length}`
  );
  const lessons = createElement("ol", "education-course__lessons");
  course.lessons.forEach((lesson) => lessons.append(createLesson(lesson, course)));
  content.append(lessonsTitle, lessons);

  const actions = createElement("div", "education-course__actions");
  const firstAvailableLesson = course.lessons.find((lesson) => lesson.videoAvailable);
  if (course.hasAccess && firstAvailableLesson) {
    const watchButton = createElement("button", "button", "Смотреть курс");
    watchButton.type = "button";
    watchButton.dataset.lessonId = firstAvailableLesson.id;
    watchButton.dataset.lessonTitle = firstAvailableLesson.title;
    watchButton.dataset.lessonDescription = firstAvailableLesson.description || "";
    actions.append(watchButton);
  } else if (!course.hasAccess && testAccessEnabled) {
    const testButton = createElement("button", "button", "Получить тестовый доступ");
    testButton.type = "button";
    testButton.dataset.testAccess = course.id;
    actions.append(
      testButton,
      createElement("small", "", "Режим разработки до подключения ЮKassa")
    );
  } else if (!course.hasAccess) {
    const accessLink = createElement("a", "button", "Получить доступ");
    accessLink.href = "consultation.html#request";
    actions.append(accessLink);
  } else {
    const unavailableButton = createElement("button", "button", "Видео пока не добавлено");
    unavailableButton.type = "button";
    unavailableButton.disabled = true;
    actions.append(unavailableButton);
  }

  content.append(actions);
  article.append(createCourseMedia(course), content);
  return article;
};

const renderCatalog = ({ userId, courses, testAccessEnabled }) => {
  userIdElement.textContent = userId;
  identityElement.hidden = !testAccessEnabled;
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
      createElement(
        "p",
        "education-state",
        "Видеокурсы временно недоступны. Попробуйте обновить страницу позже."
      )
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
      accessButton.textContent = "Не удалось открыть доступ";
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
