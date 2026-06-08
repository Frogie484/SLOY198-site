class ScheduleApi {
  async request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      },
      ...options
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Не удалось выполнить запрос.");
      error.status = response.status;
      throw error;
    }

    return data;
  }

  getAvailableSlots() {
    return this.request("/api/slots");
  }

  createBooking(payload) {
    return this.request("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  login(login, password) {
    return this.request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ login, password })
    });
  }

  getSession() {
    return this.request("/api/admin/session");
  }

  logout() {
    return this.request("/api/admin/logout", { method: "POST" });
  }

  getAdminSchedule() {
    return this.request("/api/admin/schedule");
  }

  createSlot(payload) {
    return this.request("/api/admin/slots", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  deleteSlot(slotId) {
    return this.request(`/api/admin/slots/${encodeURIComponent(slotId)}`, {
      method: "DELETE"
    });
  }

  restoreSlot(slotId) {
    return this.request(`/api/admin/slots/${encodeURIComponent(slotId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "free" })
    });
  }

  updateBookingStatus(bookingId, status) {
    return this.request(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
  }
}

window.SLOY198ScheduleApi = new ScheduleApi();
