import express from "express";

function createAuthRouter(auth) {
  const router = express.Router();

  // POST /signup/:first_name/:last_name/:email/:password
  router.post(
    "/signup/:first_name/:last_name/:email/:password",
    async (req, res) => {
      const { first_name, last_name, email, password } = req.params;
      try {
        const signup = await auth.signup(
          first_name,
          last_name,
          email,
          password
        );
        res.json(signup);
      } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  // POST /login/:email/:password/
  router.post("/login/:email/:password/", async (req, res) => {
    const { email, password } = req.params;
    try {
      const login = await auth.login(email, password);
      res.json(login);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

export default createAuthRouter;
