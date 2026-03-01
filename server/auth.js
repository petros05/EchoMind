// Stub auth module - implement signup/login with your DB (e.g. pg) when ready.
export default {
  async signup(first_name, last_name, email, password) {
    return { message: "Auth not configured" };
  },
  async login(email, password) {
    return { message: "Auth not configured" };
  },
};
