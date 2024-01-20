import express from "express";
import sqlite3 from "sqlite3";
import bodyParser from "body-parser";

import { open } from "sqlite";

import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import flash from "express-flash";
let db;
// Open SQLite database
open({
  filename: "bibliobuddy.db",
  driver: sqlite3.Database,
}).then((database) => {
  db = database;
  console.log("Connected to SQLite database");
});

let userLoggedIn = false;

const app = express();
const port = 3000;
const mySecret = "abhi";
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(flash());
app.use(
  session({
    secret: mySecret,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (username, password, done) => {
      //console.log("Password is", password);
      const response = await db.get("SELECT * from users where username=?", [
        username,
      ]);
      try {
        const user = response;
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (passwordMatch) {
          userLoggedIn = true;
          return done(null, user);
        } else {
          return done(null, false, { message: "Password Mismatch" });
        }
      } catch (err) {
        done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db.get("SELECT * FROM users WHERE id = ?", [id]);

    if (!user) {
      return done(null, false);
    }

    return done(null, user);
  } catch (err) {
    return done(err);
  }
});

app.get("/", (req, res) => {
  res.render("home.ejs", { userLoggedIn: userLoggedIn });
});

app.get("/login", (req, res) => {
  res.render("login.ejs", { userLoggedIn: userLoggedIn });
});

app.get("/register", (req, res) => {
  res.render("register.ejs", { userLoggedIn: userLoggedIn });
});

app.post("/register", async (req, res) => {
  const { email, password, fullname } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await db.run(
      "INSERT INTO users (username, password, fullname) VALUES (?, ?, ?)",
      [email, hashedPassword, fullname]
    );
    res.redirect("/");
  } catch (err) {
    console.log(err);
  }
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.get("/logout", checkifAuthenticated, (req, res) => {
  userLoggedIn = false;
  req.logout(function (err) {
    if (err) return next(err);
    res.redirect("/");
  }); // Log out the user
  res.redirect("/login");
});

app.get("/recommendations", checkifAuthenticated, async (req, res) => {
  const books = await db.all("SELECT * FROM books");
  res.render("books.ejs", { userLoggedIn: true, books: books });
});

app.get("/myrecommendations", checkifAuthenticated, async (req, res) => {
  const books = await db.all("SELECT * FROM books WHERE user_id = ?", [
    req.user.id,
  ]);
  res.render("recommendations.ejs", { userLoggedIn: true, books: books });
});

app.get("/addbook", checkifAuthenticated, (req, res) => {
  res.render("addbook.ejs");
});

app.post("/addbook", checkifAuthenticated, async (req, res) => {
  const { bookname, author, star } = req.body;
  const user_id = req.user.id;
  try {
    await db.run(
      "INSERT INTO books (user_id, book_name, author, stars) VALUES (?, ?, ?, ?)",
      [user_id, bookname, author, star]
    );
    res.redirect("/recommendations");
  } catch (err) {
    console.log(err);
  }
});

app.get("/addjob", checkifAuthenticated, (req, res) => {
  res.render("addjob.ejs");
});

app.post("/addjob", checkifAuthenticated, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { position, company, link, status } = req.body;
    const job_applied_at = new Date().toISOString();
    await db.run(
      "INSERT INTO jobs (user_id, job_position, company, job_link, applied_on, status) VALUES (?, ?, ?, ?, ?, ?)",
      [user_id, position, company, link, job_applied_at, status]
    );
    res.redirect("/jobs");
  } catch (err) {
    console.log("Job Added", err);
  }
});

app.get("/jobs", checkifAuthenticated, async (req, res) => {
  const jobs = await db.all("SELECT * FROM jobs WHERE user_id = ?", [
    req.user.id,
  ]);
  res.render("jobs.ejs", { jobs: jobs });
});

app.get("/jobs/edit/:jobId", checkifAuthenticated, async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const job = await db.get(
      "SELECT * FROM jobs WHERE job_id = ? AND user_id = ?",
      [jobId, req.user.id]
    );

    if (job) {
      res.render("editjob.ejs", { jobInformation: job });
    } else {
      const message = "You can't edit this job information";
      res.render("editjob.ejs", { message: message });
    }
  } catch (err) {
    res.render("editjob.ejs", { message: err.message });
  }
});

app.post("/editjob", checkifAuthenticated, async (req, res) => {
  console.log("Edit Information is", req.body);
  try {
    await db.run(
      "UPDATE jobs SET user_id=?, job_position=?, company=?, job_link=?, status=? WHERE job_id=?",
      [
        req.user.id,
        req.body.position,
        req.body.company,
        req.body.link,
        req.body.status,
        req.body.jobId,
      ]
    );
    res.redirect("/jobs");
  } catch (err) {
    console.log(err);
  }
});

app.get("/jobs/delete/:jobId", checkifAuthenticated, async (req, res) => {
  const jobId = parseInt(req.params.jobId);
  console.log("JobId IS", jobId); 
  try {
    const result = await db.get("SELECT user_id FROM jobs WHERE job_id = ?", [
      jobId,
    ]);
    const userIdForJob = result["user_id"];
    console.log(userIdForJob)
    if (userIdForJob === req.user.id) {
      await db.run("DELETE FROM jobs WHERE job_id = ?", [jobId]);
      res.redirect("/jobs");
    } else {
      console.log("delete failed");
    }
  } catch (err) {
    console.log(err);
  }
});







function checkifAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    res.redirect("/login");
  }
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
