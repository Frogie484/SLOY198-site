const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");
let menuScrollPosition = 0;

const syncHeader = () => {
  header?.classList.toggle("is-scrolled", window.scrollY > 20);
};

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });

const openMobileMenu = () => {
  if (!menuToggle || !nav) {
    return;
  }

  menuScrollPosition = window.scrollY;
  document.body.style.top = `-${menuScrollPosition}px`;
  document.documentElement.classList.add("menu-open");
  document.body.classList.add("menu-open");
  nav.classList.add("is-open");
  menuToggle.setAttribute("aria-expanded", "true");
  menuToggle.setAttribute("aria-label", "Закрыть меню");
};

const closeMobileMenu = ({ restoreScroll = true } = {}) => {
  if (!menuToggle || !nav) {
    return;
  }

  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Открыть меню");
  document.documentElement.classList.remove("menu-open");
  document.body.classList.remove("menu-open");
  document.body.style.top = "";

  if (restoreScroll) {
    const scrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, menuScrollPosition);
    window.requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = scrollBehavior;
    });
  }
};

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  if (isOpen) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
});

nav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    closeMobileMenu({ restoreScroll: false });
  });
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 980 && nav?.classList.contains("is-open")) {
    closeMobileMenu();
  }
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  document.querySelectorAll(".reveal").forEach((element) => {
    revealObserver.observe(element);
  });
} else {
  document.querySelectorAll(".reveal").forEach((element) => {
    element.classList.add("is-visible");
  });
}

const filterButtons = document.querySelectorAll(".filter-button");
const catalogCards = document.querySelectorAll(".catalog-card");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    catalogCards.forEach((card) => {
      const isVisible = filter === "all" || card.dataset.type === filter;
      card.classList.toggle("is-hidden", !isVisible);
    });
  });
});

document.querySelectorAll("[data-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const status = form.querySelector(".form-status");
    if (status) {
      status.textContent = "Спасибо. Мы свяжемся с вами в ближайшее время.";
    }
    form.reset();
  });
});

const freeConsultationForm = document.querySelector("[data-free-consultation]");
const consultationResult = document.querySelector("[data-consultation-result]");

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (nav?.classList.contains("is-open")) {
      closeMobileMenu();
    }
  }
});

const getConsultationResult = (formData) => {
  const [year, month, day] = formData.birthDate.split("-").map(Number);
  const context = { ...formData, day, month, year };
  const scenarios = Array.isArray(window.SLOY198_CONSULTATION_RESULTS)
    ? window.SLOY198_CONSULTATION_RESULTS
    : [];

  return scenarios.find((scenario) => {
    try {
      return typeof scenario.matches === "function" && scenario.matches(context);
    } catch {
      return false;
    }
  }) || window.SLOY198_CONSULTATION_FALLBACK || {
    eyebrow: "Предварительный результат",
    title: "Ваш запрос принят",
    summary: "Персональный сценарий будет доступен после наполнения базы результатов.",
    details: []
  };
};

const renderConsultationResult = (result, name) => {
  if (!consultationResult) {
    return;
  }

  const details = Array.isArray(result.details) ? result.details : [];
  consultationResult.querySelector("[data-result-eyebrow]").textContent = result.eyebrow;
  consultationResult.querySelector("[data-result-title]").textContent = `${name}, ${result.title.toLowerCase()}`;
  consultationResult.querySelector("[data-result-summary]").textContent = result.summary;

  const detailsContainer = consultationResult.querySelector("[data-result-details]");
  detailsContainer.replaceChildren();
  details.forEach((detail) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = detail;
    detailsContainer.append(paragraph);
  });
  detailsContainer.hidden = details.length === 0;

  consultationResult.hidden = false;
  window.requestAnimationFrame(() => {
    consultationResult.classList.add("is-visible");
    consultationResult.focus({ preventScroll: true });
    consultationResult.scrollIntoView({ behavior: "smooth", block: "center" });
  });
};

if (freeConsultationForm) {
  const nameInput = freeConsultationForm.querySelector('[name="name"]');
  const birthDateInput = freeConsultationForm.querySelector('[name="birthDate"]');
  const submitButton = freeConsultationForm.querySelector("[data-free-consultation-submit]");
  birthDateInput.max = new Date().toISOString().split("T")[0];

  const submitFreeConsultation = () => {
    const status = freeConsultationForm.querySelector(".form-status");
    const name = nameInput.value.trim();
    const birthDate = birthDateInput.value;
    const isDateValid = birthDate && birthDate <= birthDateInput.max;

    nameInput.setAttribute("aria-invalid", String(name.length < 2));
    birthDateInput.setAttribute("aria-invalid", String(!isDateValid));

    if (name.length < 2 || !isDateValid) {
      status.textContent = "Пожалуйста, укажите имя и корректную дату рождения.";
      freeConsultationForm.reportValidity();
      return;
    }

    status.textContent = "";
    const result = getConsultationResult({ name, birthDate });
    renderConsultationResult(result, name);
  };

  freeConsultationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitFreeConsultation();
  });

  submitButton.addEventListener("click", (event) => {
    event.preventDefault();
    submitFreeConsultation();
  });
}
