const bookingApi = window.SLOY198ScheduleApi;
const bookingSlotsContainer = document.querySelector("[data-booking-slots]");
const bookingForm = document.querySelector("[data-booking-form]");
const bookingStatus = document.querySelector("[data-booking-status]");
const bookingSuccess = document.querySelector("[data-booking-success]");
const selectedSlotLabel = document.querySelector("[data-selected-slot]");
const confirmationModal = document.querySelector("[data-booking-confirmation]");
const confirmationDialog = confirmationModal.querySelector(".conversion-modal__dialog");
const confirmationDate = confirmationModal.querySelector("[data-confirmation-date]");
const confirmationTime = confirmationModal.querySelector("[data-confirmation-time]");
const confirmationDuration = confirmationModal.querySelector("[data-confirmation-duration]");
const confirmationStatus = confirmationModal.querySelector("[data-confirmation-status]");
const confirmBookingButton = confirmationModal.querySelector("[data-confirm-booking]");
let availableSlots = [];
let selectedSlotId = "";
let pendingBooking = null;
let confirmationReturnFocus = null;
const slotIdInput = bookingForm.querySelector('[name="slotId"]');
const birthDateInput = bookingForm.querySelector('[name="birthDate"]');

const formatSlotDate = (date) =>
  new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long"
  }).format(new Date(`${date}T12:00:00`));

const renderAvailableSlots = () => {
  bookingSlotsContainer.replaceChildren();

  if (availableSlots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "booking-empty";
    empty.textContent = "Свободных слотов пока нет. Пожалуйста, проверьте расписание позже.";
    bookingSlotsContainer.append(empty);
    return;
  }

  const groups = availableSlots.reduce((result, slot) => {
    if (!result.has(slot.date)) {
      result.set(slot.date, []);
    }
    result.get(slot.date).push(slot);
    return result;
  }, new Map());
  groups.forEach((slots, date) => {
    const group = document.createElement("section");
    group.className = "booking-date-group";
    const heading = document.createElement("h4");
    heading.textContent = formatSlotDate(date);
    const buttons = document.createElement("div");
    buttons.className = "booking-time-grid";

    slots.forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-slot";
      button.dataset.slotId = slot.id;
      button.setAttribute("aria-pressed", String(slot.id === selectedSlotId));
      const time = document.createElement("strong");
      const type = document.createElement("span");
      const duration = document.createElement("small");
      time.textContent = slot.time;
      type.textContent = slot.type;
      duration.textContent = `${slot.duration} мин.`;
      button.append(time, type, duration);
      buttons.append(button);
    });

    group.append(heading, buttons);
    bookingSlotsContainer.append(group);
  });
};

const loadAvailableSlots = async ({ preserveSelectedLabel = false } = {}) => {
  bookingSlotsContainer.innerHTML = '<p class="booking-empty">Загрузка расписания...</p>';
  try {
    const { slots } = await bookingApi.getAvailableSlots();
    availableSlots = slots;
    if (!availableSlots.some((slot) => slot.id === selectedSlotId)) {
      selectedSlotId = "";
      slotIdInput.value = "";
      if (!preserveSelectedLabel) {
        selectedSlotLabel.textContent = "Сначала выберите дату и время.";
      }
    }
    renderAvailableSlots();
  } catch (error) {
    bookingSlotsContainer.innerHTML =
      `<p class="booking-empty">${error.message} Запустите сайт через npm run dev.</p>`;
  }
};

bookingSlotsContainer.addEventListener("click", (event) => {
  const button = event.target.closest("[data-slot-id]");
  if (!button) {
    return;
  }

  selectedSlotId = button.dataset.slotId;
  slotIdInput.value = selectedSlotId;
  const slot = availableSlots.find((item) => item.id === selectedSlotId);
  selectedSlotLabel.textContent =
    `${formatSlotDate(slot.date)}, ${slot.time} · ${slot.type}, ${slot.duration} мин.`;
  bookingSuccess.hidden = true;
  bookingStatus.textContent = "";
  renderAvailableSlots();
});

const closeConfirmation = ({ returnFocus = true } = {}) => {
  confirmationModal.classList.remove("is-open");
  window.setTimeout(() => {
    confirmationModal.hidden = true;
    document.body.classList.remove("modal-open");
    if (returnFocus) {
      confirmationReturnFocus?.focus();
    }
  }, 280);
};

const openConfirmation = (slot, bookingData) => {
  pendingBooking = bookingData;
  confirmationReturnFocus = document.activeElement;
  confirmationDate.textContent = formatSlotDate(slot.date);
  confirmationTime.textContent = slot.time;
  confirmationDuration.textContent = `${slot.duration} минут`;
  confirmationStatus.textContent = "";
  confirmationModal.hidden = false;
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => {
    confirmationModal.classList.add("is-open");
    confirmationDialog.focus();
  });
};

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  bookingSuccess.hidden = true;

  if (!selectedSlotId) {
    bookingStatus.textContent = "Выберите свободную дату и время.";
    return;
  }

  if (!bookingForm.reportValidity()) {
    return;
  }

  const formData = new FormData(bookingForm);
  const slot = availableSlots.find((item) => item.id === selectedSlotId);
  if (!slot) {
    bookingStatus.textContent = "Выбранное время уже недоступно. Обновите расписание.";
    return;
  }

  bookingStatus.textContent = "";
  openConfirmation(slot, {
    slotId: selectedSlotId,
    name: formData.get("name"),
    phone: formData.get("phone"),
    telegram: formData.get("telegram"),
    birthDate: formData.get("birthDate"),
    comment: formData.get("comment")
  });
});

confirmBookingButton.addEventListener("click", async () => {
  if (!pendingBooking) {
    return;
  }

  confirmBookingButton.disabled = true;
  confirmationStatus.textContent = "Проверяем доступность и сохраняем запись...";

  try {
    const { slots: latestSlots } = await bookingApi.getAvailableSlots();
    if (!latestSlots.some((slot) => slot.id === pendingBooking.slotId)) {
      const conflictError = new Error("Выбранное время уже недоступно. Выберите другой слот.");
      conflictError.status = 409;
      throw conflictError;
    }

    await bookingApi.createBooking(pendingBooking);
    closeConfirmation({ returnFocus: false });
    bookingForm.reset();
    selectedSlotId = "";
    slotIdInput.value = "";
    pendingBooking = null;
    selectedSlotLabel.textContent = "Запись сохранена.";
    bookingStatus.textContent = "";
    bookingSuccess.hidden = false;
    bookingSuccess.focus({ preventScroll: true });
    await loadAvailableSlots({ preserveSelectedLabel: true });
  } catch (error) {
    confirmationStatus.textContent = error.message;
    if (error.status === 409) {
      selectedSlotId = "";
      slotIdInput.value = "";
      await loadAvailableSlots();
    }
  } finally {
    confirmBookingButton.disabled = false;
  }
});

confirmationModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-change-booking-time]")) {
    closeConfirmation();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmationModal.hidden) {
    closeConfirmation();
  }
});

document.querySelector("[data-booking-refresh]").addEventListener("click", loadAvailableSlots);
birthDateInput.max = new Date().toISOString().slice(0, 10);
loadAvailableSlots();
