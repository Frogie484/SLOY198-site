const api = window.SLOY198ScheduleApi;
const loginSection = document.querySelector("[data-admin-login]");
const dashboard = document.querySelector("[data-admin-dashboard]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const slotForm = document.querySelector("[data-slot-form]");
const slotMessage = document.querySelector("[data-slot-message]");
const scheduleList = document.querySelector("[data-schedule-list]");
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
