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
    return this.request("/api/admin/auth?action=login", {
      method: "POST",
      body: JSON.stringify({ login, password })
    });
  }

  getSession() {
    return this.request("/api/admin/auth?action=session");
  }

  logout() {
    return this.request("/api/admin/auth?action=logout", { method: "POST" });
  }

  getAdminSchedule() {
    return this.request("/api/admin/booking?action=schedule");
  }

  createSlot(payload) {
    return this.request("/api/admin/slot?action=slots", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  deleteSlot(slotId) {
    return this.request(
      `/api/admin/slot?action=slot&id=${encodeURIComponent(slotId)}`,
      {
      method: "DELETE"
      }
    );
  }

  restoreSlot(slotId) {
    return this.request(
      `/api/admin/slot?action=slot&id=${encodeURIComponent(slotId)}`,
      {
      method: "PATCH",
      body: JSON.stringify({ status: "free" })
      }
    );
  }

  updateBookingStatus(bookingId, status) {
    return this.request(
      `/api/admin/booking?action=booking&id=${encodeURIComponent(bookingId)}`,
      {
      method: "PATCH",
      body: JSON.stringify({ status })
      }
    );
  }

  getEducationCatalog() {
    return this.request("/api/education/catalog");
  }

  grantOwnTestAccess(courseId) {
    return this.request("/api/education/test-access", {
      method: "POST",
      body: JSON.stringify({ courseId })
    });
  }

  getLessonVideo(lessonId) {
    return this.request(`/api/education/video?id=${encodeURIComponent(lessonId)}`);
  }

  getAdminCourses() {
    return this.request("/api/admin/content?action=courses");
  }

  createCourse(payload) {
    return this.request("/api/admin/content?action=courses", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  updateCourse(courseId, payload) {
    return this.request(
      `/api/admin/content?action=course&id=${encodeURIComponent(courseId)}`,
      {
      method: "PATCH",
      body: JSON.stringify(payload)
      }
    );
  }

  deleteCourse(courseId) {
    return this.request(
      `/api/admin/content?action=course&id=${encodeURIComponent(courseId)}`,
      {
      method: "DELETE"
      }
    );
  }

  createLesson(payload) {
    return this.request("/api/admin/content?action=lessons", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  updateLesson(lessonId, payload) {
    return this.request(
      `/api/admin/content?action=lesson&id=${encodeURIComponent(lessonId)}`,
      {
      method: "PATCH",
      body: JSON.stringify(payload)
      }
    );
  }

  deleteLesson(lessonId) {
    return this.request(
      `/api/admin/content?action=lesson&id=${encodeURIComponent(lessonId)}`,
      {
      method: "DELETE"
      }
    );
  }

  moveLesson(lessonId, direction) {
    return this.updateLesson(lessonId, { direction });
  }

  requestVideoUpload(payload) {
    return this.request("/api/admin/content?action=video-upload", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  grantCourseAccess(userId, courseId) {
    return this.request("/api/admin/content?action=course-access", {
      method: "POST",
      body: JSON.stringify({ userId, courseId })
    });
  }
}

window.SLOY198ScheduleApi = new ScheduleApi();
