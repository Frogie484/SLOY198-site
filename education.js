const educationApi = window.SLOY198ScheduleApi;
const catalogElement = document.querySelector("[data-course-catalog]");

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
    const url = new URL(value);
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
      return /^\d+$/.test(videoId || "")
        ? `https://player.vimeo.com/video/${videoId}`
        : "";
    }
  } catch {
    return "";
  }
  return "";
};

const createCourseMedia = (course) => {
  const media = createElement("div", "education-course__media");
  const embedUrl = course.hasAccess ? getEmbedUrl(course.videoUrl) : "";

  if (embedUrl) {
    const frame = document.createElement("iframe");
    frame.src = embedUrl;
    frame.title = `Видеокурс «${course.title}»`;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    frame.allowFullscreen = true;
    frame.dataset.courseFrame = course.id;
    media.append(frame);
    return { media, hasVideo: true };
  }

  if (course.coverImageUrl) {
    const image = document.createElement("img");
    image.src = course.coverImageUrl;
    image.alt = `Обложка курса «${course.title}»`;
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    media.append(image);
  }

  media.append(
    createElement(
      "span",
      "education-course__media-state",
      course.hasAccess ? "Видео пока не добавлено" : "Доступ к видео закрыт"
    )
  );
  return { media, hasVideo: false };
};

const createCourseCard = (course, index) => {
  const article = createElement("article", "education-course");
  const { media, hasVideo } = createCourseMedia(course);
  const content = createElement("div", "education-course__content");
  const meta = createElement("div", "education-course__meta");
  meta.append(
    createElement(
      "span",
      "education-course__access",
      course.hasAccess
        ? `Доступ открыт · ${String(index + 1).padStart(2, "0")}`
        : `Видеокурс · ${String(index + 1).padStart(2, "0")}`
    ),
    createElement("strong", "education-course__price", formatPrice(course.price))
  );
  content.append(
    meta,
    createElement("h3", "", course.title),
    createElement(
      "p",
      "education-course__description",
      course.shortDescription || "Краткое описание курса скоро появится."
    )
  );

  if (course.fullDescription) {
    content.append(
      createElement("p", "education-course__full-description", course.fullDescription)
    );
  }

  const actions = createElement("div", "education-course__actions");
  if (course.hasAccess && hasVideo) {
    const watchButton = createElement("button", "button", "Смотреть курс");
    watchButton.type = "button";
    watchButton.dataset.focusCourse = course.id;
    actions.append(watchButton);
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
  article.append(media, content);
  return article;
};

const renderCatalog = ({ courses }) => {
  catalogElement.replaceChildren();
  if (courses.length === 0) {
    catalogElement.append(
      createElement("p", "education-state", "Опубликованных видеокурсов пока нет.")
    );
    return;
  }
  courses.forEach((course, index) => {
    catalogElement.append(createCourseCard(course, index));
  });
};

const loadCatalog = async () => {
  try {
    renderCatalog(await educationApi.getEducationCatalog());
  } catch {
    catalogElement.replaceChildren(
      createElement(
        "p",
        "education-state",
        "Видеокурсы временно недоступны. Попробуйте обновить страницу позже."
      )
    );
  }
};

catalogElement.addEventListener("click", (event) => {
  const button = event.target.closest("[data-focus-course]");
  if (!button) {
    return;
  }
  const frame = catalogElement.querySelector(
    `[data-course-frame="${CSS.escape(button.dataset.focusCourse)}"]`
  );
  frame?.scrollIntoView({ behavior: "smooth", block: "center" });
  frame?.focus({ preventScroll: true });
});

loadCatalog();
