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
      course.hasAccess ? "Курс доступен для просмотра" : "Видео откроется после покупки"
    )
  );
  return media;
};

const openCourseVideo = (course, article) => {
  const embedUrl = getEmbedUrl(course.videoUrl);
  const media = article.querySelector(".education-course__media");
  if (!embedUrl || !media) {
    return false;
  }

  const frame = document.createElement("iframe");
  frame.src = embedUrl;
  frame.title = `Видеокурс «${course.title}»`;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  frame.allowFullscreen = true;
  media.replaceChildren(frame);
  article.classList.add("education-course--watching");
  frame.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
};

const createCourseCard = (course, index, testAccessEnabled) => {
  const article = createElement("article", "education-course");
  const media = createCourseMedia(course);
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
  const actionStatus = createElement("small", "education-course__action-status");
  actionStatus.setAttribute("aria-live", "polite");

  if (course.hasAccess && getEmbedUrl(course.videoUrl)) {
    const watchButton = createElement("button", "button", "Смотреть курс");
    watchButton.type = "button";
    watchButton.addEventListener("click", () => {
      if (openCourseVideo(course, article)) {
        watchButton.remove();
      }
    });
    actions.append(watchButton);
  } else if (course.hasAccess) {
    const unavailableButton = createElement("button", "button", "Видео пока не добавлено");
    unavailableButton.type = "button";
    unavailableButton.disabled = true;
    actions.append(unavailableButton);
  } else {
    const buyButton = createElement("button", "button", "Купить");
    buyButton.type = "button";
    buyButton.addEventListener("click", () => {
      actionStatus.textContent = "Оплата скоро будет доступна.";
    });
    actions.append(buyButton);

    if (testAccessEnabled) {
      const testButton = createElement(
        "button",
        "button button--ghost education-course__test-access",
        "Открыть доступ тестово"
      );
      testButton.type = "button";
      testButton.addEventListener("click", async () => {
        testButton.disabled = true;
        actionStatus.textContent = "Открываем тестовый доступ...";
        try {
          await educationApi.grantOwnTestAccess(course.id);
          await loadCatalog();
        } catch (error) {
          actionStatus.textContent = error.message;
          testButton.disabled = false;
        }
      });
      actions.append(testButton);
    }
  }

  actions.append(actionStatus);
  content.append(actions);
  article.append(media, content);
  return article;
};

const renderCatalog = ({ courses, testAccessEnabled = false }) => {
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

loadCatalog();
