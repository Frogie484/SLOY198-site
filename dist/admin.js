const api = window.SLOY198ScheduleApi;
const loginSection = document.querySelector("[data-admin-login]");
const dashboard = document.querySelector("[data-admin-dashboard]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const slotForm = document.querySelector("[data-slot-form]");
const slotMessage = document.querySelector("[data-slot-message]");
const scheduleList = document.querySelector("[data-schedule-list]");
const courseForm = document.querySelector("[data-course-form]");
const courseMessage = document.querySelector("[data-course-message]");
const courseFormTitle = document.querySelector("[data-course-form-title]");
const courseCancelButton = document.querySelector("[data-course-cancel]");
const adminCourses = document.querySelector("[data-admin-courses]");
let educationCourses = [];
const statusLabels = {
  new: "Новая",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  completed: "Проведена"
};
const slotStatusLabels = {
  free: "Свободен",
  booked: "Забронирован",
  unavailable: "Недоступен из-за пересечения",
  cancelled: "Отменён"
};

const setMessage = (element, message = "", isError = false) => {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
};

const showLogin = () => {
  loginSection.hidden = false;
  dashboard.hidden = true;
};

const showDashboard = async () => {
  loginSection.hidden = true;
  dashboard.hidden = false;
  await loadSchedule();
};

const formatDate = (date) =>
  new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));

const createDetail = (term, value) => {
  const fragment = document.createDocumentFragment();
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value || "—";
  fragment.append(dt, dd);
  return fragment;
};

const createActionButton = (label, action, id, variant = "") => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `admin-button ${variant}`.trim();
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
};

const renderSchedule = (slots) => {
  scheduleList.replaceChildren();

  if (slots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = "Слотов пока нет. Добавьте первое свободное время.";
    scheduleList.append(empty);
    return;
  }

  let currentDate = "";
  slots.forEach((slot) => {
    if (slot.date !== currentDate) {
      currentDate = slot.date;
      const heading = document.createElement("h3");
      heading.className = "schedule-date";
      heading.textContent = formatDate(slot.date);
      scheduleList.append(heading);
    }

    const card = document.createElement("article");
    card.className = `schedule-card schedule-card--${slot.status}`;

    const time = document.createElement("div");
    time.className = "schedule-card__time";
    const timeValue = document.createElement("strong");
    timeValue.textContent = slot.time;
    const type = document.createElement("span");
    type.textContent = `${slot.type} · ${slot.duration} мин.`;
    const badge = document.createElement("span");
    badge.className = `schedule-badge schedule-badge--${slot.status}`;
    badge.textContent = slotStatusLabels[slot.status] || slot.status;
    time.append(timeValue, type, badge);

    const details = document.createElement("dl");
    details.className = "schedule-card__client";
    if (slot.booking) {
      details.append(
        createDetail("Клиент", slot.booking.client.name),
        createDetail("Телефон", slot.booking.client.phone),
        createDetail("Telegram", slot.booking.client.telegram),
        createDetail("Дата рождения", slot.booking.client.birthDate),
        createDetail("Комментарий", slot.booking.client.comment),
        createDetail("Статус", statusLabels[slot.booking.status] || slot.booking.status)
      );
    } else if (slot.status === "unavailable") {
      const blockers = slot.blockedBySlots
        .map((item) => `${item.time} (${item.duration} мин.)`)
        .join(", ");
      details.append(
        createDetail("Причина", "Недоступен из-за пересечения"),
        createDetail("Пересекается с", blockers || "Требует ручного восстановления")
      );
    } else if (slot.status === "cancelled") {
      details.append(createDetail("Запись", "Отменена, слот можно восстановить"));
    } else {
      details.append(createDetail("Запись", "Ожидает клиента"));
    }

    const actions = document.createElement("div");
    actions.className = "schedule-card__actions";
    if (slot.status === "booked" && slot.booking) {
      actions.append(
        createActionButton("Подтвердить", "status-confirmed", slot.booking.id),
        createActionButton("Отменить", "status-cancelled", slot.booking.id, "admin-button--danger"),
        createActionButton("Проведена", "status-completed", slot.booking.id)
      );
    } else if (slot.status === "unavailable") {
      actions.append(createActionButton("Восстановить", "restore-slot", slot.id));
    } else if (slot.status === "free") {
      actions.append(createActionButton("Удалить", "delete-slot", slot.id, "admin-button--danger"));
    }

    card.append(time, details, actions);
    scheduleList.append(card);
  });
};

const updateStats = (slots) => {
  document.querySelector("[data-stat-free]").textContent =
    slots.filter((slot) => slot.status === "free").length;
  document.querySelector("[data-stat-booked]").textContent =
    slots.filter((slot) => slot.status === "booked").length;
  document.querySelector("[data-stat-unavailable]").textContent =
    slots.filter((slot) => slot.status === "unavailable").length;
  document.querySelector("[data-stat-new]").textContent =
    slots.filter((slot) => slot.booking?.status === "new").length;
};

async function loadSchedule() {
  scheduleList.innerHTML = '<p class="admin-empty">Загрузка расписания...</p>';
  try {
    const { slots } = await api.getAdminSchedule();
    renderSchedule(slots);
    updateStats(slots);
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      return;
    }
    scheduleList.innerHTML = `<p class="admin-empty">${error.message}</p>`;
  }
}

const resetCourseForm = () => {
  courseForm.reset();
  courseForm.elements.courseId.value = "";
  courseForm.elements.price.value = "0";
  courseForm.elements.status.value = "draft";
  courseFormTitle.textContent = "Создать курс";
  courseCancelButton.hidden = true;
};

const renderCourse = (course) => {
  const card = document.createElement("article");
  card.className = "admin-course";
  card.dataset.courseId = course.id;

  if (course.coverImageUrl) {
    const cover = document.createElement("img");
    cover.className = "admin-course__cover";
    cover.src = course.coverImageUrl;
    cover.alt = "";
    cover.loading = "lazy";
    card.append(cover);
  }

  const head = document.createElement("div");
  head.className = "admin-course__head";
  const copy = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "admin-kicker";
  kicker.textContent = course.status === "published" ? "Опубликован" : "Черновик";
  const title = document.createElement("h3");
  title.textContent = course.title;
  const description = document.createElement("p");
  description.textContent = course.shortDescription || "Краткое описание пока не добавлено.";
  const meta = document.createElement("p");
  meta.className = "admin-course__meta";
  meta.textContent = `${Number(course.price).toLocaleString("ru-RU")} ₽ · ${
    course.videoUrl ? "Видео добавлено" : "Без видео"
  }`;
  copy.append(kicker, title, description, meta);
  const actions = document.createElement("div");
  actions.className = "admin-education-actions";
  actions.append(
    createActionButton("Редактировать", "course-edit", course.id),
    createActionButton(
      course.status === "published" ? "Снять с публикации" : "Опубликовать",
      "course-toggle",
      course.id
    ),
    createActionButton("Удалить курс", "course-delete", course.id, "admin-button--danger")
  );
  head.append(copy, actions);

  if (course.fullDescription) {
    const fullDescription = document.createElement("p");
    fullDescription.className = "admin-course__full-description";
    fullDescription.textContent = course.fullDescription;
    card.append(head, fullDescription);
  } else {
    card.append(head);
  }
  return card;
};

const renderEducation = () => {
  adminCourses.replaceChildren();
  if (educationCourses.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = "Курсов пока нет. Создайте первый курс.";
    adminCourses.append(empty);
    return;
  }
  educationCourses.forEach((course) => adminCourses.append(renderCourse(course)));
};

async function loadEducation() {
  adminCourses.innerHTML = '<p class="admin-empty">Загрузка курсов...</p>';
  try {
    const data = await api.getAdminCourses();
    educationCourses = data.courses;
    renderEducation();
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      return;
    }
    adminCourses.innerHTML = `<p class="admin-empty">${error.message}</p>`;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "Проверяем данные...");
  const formData = new FormData(loginForm);

  try {
    await api.login(formData.get("login"), formData.get("password"));
    loginForm.reset();
    setMessage(loginMessage);
    await showDashboard();
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  }
});

slotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(slotForm);
  setMessage(slotMessage, "Добавляем слот...");

  try {
    await api.createSlot({
      date: formData.get("date"),
      time: formData.get("time"),
      duration: Number(formData.get("duration")),
      type: formData.get("type")
    });
    slotForm.reset();
    slotForm.querySelector('[name="duration"]').value = "30";
    setMessage(slotMessage, "Слот добавлен.");
    await loadSchedule();
  } catch (error) {
    setMessage(slotMessage, error.message, true);
  }
});

scheduleList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  button.disabled = true;
  try {
    if (button.dataset.action === "delete-slot") {
      await api.deleteSlot(button.dataset.id);
    } else if (button.dataset.action === "restore-slot") {
      await api.restoreSlot(button.dataset.id);
    } else if (button.dataset.action.startsWith("status-")) {
      await api.updateBookingStatus(button.dataset.id, button.dataset.action.replace("status-", ""));
    }
    await loadSchedule();
  } catch (error) {
    setMessage(slotMessage, error.message, true);
    button.disabled = false;
  }
});

document.querySelector("[data-refresh]").addEventListener("click", loadSchedule);
document.querySelector("[data-education-refresh]").addEventListener("click", loadEducation);
document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
  tab.addEventListener("click", async () => {
    document.querySelectorAll("[data-admin-tab]").forEach((item) => {
      item.classList.toggle("is-active", item === tab);
    });
    document.querySelectorAll("[data-admin-view]").forEach((view) => {
      view.hidden = view.dataset.adminView !== tab.dataset.adminTab;
    });
    if (tab.dataset.adminTab === "education") {
      await loadEducation();
    }
  });
});

courseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(courseForm);
  const payload = {
    title: data.get("title"),
    shortDescription: data.get("shortDescription"),
    fullDescription: data.get("fullDescription"),
    coverImageUrl: data.get("coverImageUrl"),
    videoUrl: data.get("videoUrl"),
    price: Number(data.get("price")),
    status: data.get("status")
  };
  setMessage(courseMessage, "Сохраняем курс...");
  try {
    if (data.get("courseId")) {
      await api.updateCourse(data.get("courseId"), payload);
    } else {
      await api.createCourse(payload);
    }
    resetCourseForm();
    setMessage(courseMessage, "Курс сохранён.");
    await loadEducation();
  } catch (error) {
    setMessage(courseMessage, error.message, true);
  }
});

courseCancelButton.addEventListener("click", resetCourseForm);

adminCourses.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  const course = educationCourses.find((item) => item.id === button.dataset.id);

  if (button.dataset.action === "course-edit" && course) {
    courseForm.elements.courseId.value = course.id;
    courseForm.elements.title.value = course.title;
    courseForm.elements.shortDescription.value = course.shortDescription;
    courseForm.elements.fullDescription.value = course.fullDescription;
    courseForm.elements.coverImageUrl.value = course.coverImageUrl;
    courseForm.elements.videoUrl.value = course.videoUrl;
    courseForm.elements.price.value = course.price;
    courseForm.elements.status.value = course.status;
    courseFormTitle.textContent = "Редактировать курс";
    courseCancelButton.hidden = false;
    courseForm.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (
    button.dataset.action === "course-delete" &&
    !window.confirm("Удалить выбранный материал без возможности восстановления?")
  ) {
    return;
  }

  button.disabled = true;
  try {
    if (button.dataset.action === "course-delete") {
      await api.deleteCourse(button.dataset.id);
    } else if (button.dataset.action === "course-toggle" && course) {
      await api.updateCourse(course.id, {
        status: course.status === "published" ? "draft" : "published"
      });
    }
    await loadEducation();
  } catch (error) {
    setMessage(courseMessage, error.message, true);
    button.disabled = false;
  }
});

document.querySelector("[data-logout]").addEventListener("click", async () => {
  await api.logout();
  showLogin();
});

const initialize = async () => {
  slotForm.querySelector('[name="date"]').min = new Date().toISOString().slice(0, 10);
  try {
    await api.getSession();
    await showDashboard();
  } catch {
    showLogin();
  }
};

initialize();
