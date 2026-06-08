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
    return this.request("/api/admin/courses");
  }

  createCourse(payload) {
    return this.request("/api/admin/courses", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  updateCourse(courseId, payload) {
    return this.request(`/api/admin/courses/${encodeURIComponent(courseId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  deleteCourse(courseId) {
    return this.request(`/api/admin/courses/${encodeURIComponent(courseId)}`, {
      method: "DELETE"
    });
  }

  createLesson(payload) {
    return this.request("/api/admin/lessons", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  updateLesson(lessonId, payload) {
    return this.request(`/api/admin/lessons/${encodeURIComponent(lessonId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  deleteLesson(lessonId) {
    return this.request(`/api/admin/lessons/${encodeURIComponent(lessonId)}`, {
      method: "DELETE"
    });
  }

  moveLesson(lessonId, direction) {
    return this.updateLesson(lessonId, { direction });
  }

  requestVideoUpload(payload) {
    return this.request("/api/admin/video-upload", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  grantCourseAccess(userId, courseId) {
    return this.request("/api/admin/course-access", {
      method: "POST",
      body: JSON.stringify({ userId, courseId })
    });
  }
}

window.SLOY198ScheduleApi = new ScheduleApi();
