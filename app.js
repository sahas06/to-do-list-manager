const express = require("express"); //importing express
var csrf = require("tiny-csrf");
const app = express(); // creating new application
const bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
app.use(bodyParser.json());
const path = require("path");
const passport = require("passport");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");
const bcrypt = require("bcrypt");

const saltRounds = 10;
app.set("views", path.join(__dirname, "views"));
app.use(flash());
const { Todo, User } = require("./models");
// eslint-disable-next-line no-unused-vars
const todo = require("./models/todo");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));
//SET EJS AS VIEW ENGINE
app.use(cookieParser("shh! some secrete string"));
app.use(csrf("this_should_be_32_character_long", ["POST", "PUT", "DELETE"]));
app.set("view engine", "ejs");
app.use(
  session({
    secret: "my-super-secret-key-21728172615261562",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, //24hours
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(function (request, response, next) {
  response.locals.messages = request.flash();
  next();
});

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    (username, password, done) => {
      User.findOne({ where: { email: username } })
        .then(async function (user) {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: "Invalid password" });
          }
        })
        .catch(() => {
          return done(null, false, { message: "Invalid User!!" });
        });
    }
  )
);

passport.serializeUser((user, done) => {
  console.log("Serializing user in session", user.id);
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findByPk(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

app.get("/", async (request, response) => {
  if (request.user) {
    return response.redirect("/todo");
  } else {
    response.render("index", {
      title: "Todo Application",
      csrfToken: request.csrfToken(),
    });
  }
});

app.get(
  "/todo",
  connectEnsureLogin.ensureLoggedIn(),
  async function (request, response) {
    try {
      const loggedInUser = request.user.id;
      const allTodos = await Todo.getTodos();
      const overdue = await Todo.overdue(loggedInUser);
      const dueLater = await Todo.dueLater(loggedInUser);
      const dueToday = await Todo.dueToday(loggedInUser);
      const completedItems = await Todo.completedItems(loggedInUser);
      if (request.accepts("html")) {
        response.render("todo", {
          title: "Todo Application",
          allTodos,
          overdue,
          dueToday,
          dueLater,
          completedItems,
          csrfToken: request.csrfToken(),
        });
      } else {
        response.json({ overdue, dueToday, dueLater, completedItems });
      }
    } catch (err) {
      console.log(err);
    }
  }
);
app.get("/signup", (request, response) => {
  response.render("signup", {
    title: "Signup",
    csrfToken: request.csrfToken(),
  });
});
app.post("/users", async (request, response) => {
  if (request.body.email.length == 0) {
    request.flash("error", "email can not be empty!!");
    return response.redirect("/signup");
  }
  if (request.body.firstName.length == 0) {
    request.flash("error", "First name can not be empty");
    return response.redirect("/signup");
  }
  if (request.body.password.length == 0) {
    request.flash("error", "Password can not be empty");
    return response.redirect("/signup");
  }
  const hashedPwd = await bcrypt.hash(request.body.password, saltRounds);
  console.log(hashedPwd);

  try {
    const user = await User.create({
      firstName: request.body.firstName,
      lastName: request.body.lastName,
      email: request.body.email,
      password: hashedPwd,
    });
    request.login(user, (err) => {
      if (err) {
        console.log(err);
        response.redirect("/todo");
      } else {
        request.flash("success", "Sign up successful");
        response.redirect("/todo");
      }
    });
  } catch (error) {
    console.log("error");
    request.flash("error", "User Already Exist with this mail!!");
    return response.redirect("/signup");
  }
});

app.get("/login", (request, response) => {
  response.render("login", { title: "Login", csrfToken: request.csrfToken() });
});

app.post(
  "/session",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  function (request, response) {
    console.log(request.user);
    response.redirect("/todo");
  }
);
app.get("/signout", (request, response, next) => {
  request.logout((err) => {
    if (err) {
      return next(err);
    }
    response.redirect("/");
  });
});

app.get("/todos", async (request, response) => {
  // defining route to displaying message
  console.log("Todo list");
  try {
    const todoslist = await Todo.findAll();
    return response.json(todoslist);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});
app.get("/todos/:id", async function (request, response) {
  try {
    const todo = await Todo.findByPk(request.params.id);
    return response.json(todo);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.post(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    if (request.body.dueDate.length == 0) {
      request.flash("error", "Date can not be empty!!");
      return response.redirect("/todo");
    }
    if (request.body.title.length == 0) {
      request.flash("error", "title can not be empty");
      return response.redirect("/todo");
    } else if (request.body.title.length < 5) {
      request.flash("error", "title should be atleat 5 character in length");
      return response.redirect("/todo");
    }
    console.log("creating new todo", request.body);
    try {
      // eslint-disable-next-line no-unused-vars
      await Todo.addTodo({
        title: request.body.title,
        dueDate: request.body.dueDate,
        completed: false,
        userId: request.user.id,
      });
      return response.redirect("/todo");
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);
//PUT https://mytodoapp.com/todos/123/markAscomplete
app.put(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("we have to update a todo with ID:", request.params.id);
    try {
      const todo = await Todo.findByPk(request.params.id);
      const updatedtodo = await todo.setCompletionStatus(
        request.body.completed
      );
      return response.json(updatedtodo);
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);
app.put("/todos/:id/markAsCompleted", async (request, response) => {
  console.log("we have to update a todo with ID:", request.params.id);
  const todo = await Todo.findByPk(request.params.id);
  try {
    const updatedtodo = await todo.setCompletionStatus(request.body.completed);
    return response.json(updatedtodo);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});
app.put("/todos/:id/markAsCompleted", async (request, response) => {
  console.log("we have to update a todo with ID:", request.params.id);
  const todo = await Todo.findByPk(request.params.id);
  try {
    const updatedtodo = await todo.markAsCompleted(request.body.completed);
    return response.json(updatedtodo);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.delete(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("delete a todo with ID:", request.params.id);
    try {
      await Todo.remove(request.params.id, request.user.id);
      return response.json({ success: true });
    } catch (error) {
      return response.status(422).json(error);
    }
  }
);

app.get("/todos/:id/note", async function (request, response) {
  try {
    // const todo = await Todo.findByPk(request.params.id);

    return response.render("notes", {
      csrfToken: request.csrfToken(),
      id: request.params.id,
    });
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.get("/todos/:id/viewnote", async function (request, response) {
  try {
    console.log(request.params.id);
    const notestodo = await Todo.findByPk(request.params.id);
    console.log(notestodo);
    return response.render("viewnotes", {
      notes: notestodo.notes,
      csrfToken: request.csrfToken(),
      id: request.params.id,
    });
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.post(
  "/todo/:id/notes",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    let id = request.params.id;
    if (request.body.notes.length == 0 || request.body.notes == "") {
      request.flash("error", "notes can not be empty!!");
      return response.redirect(`/todos/${id}/note`);
    }

    try {
      // eslint-disable-next-line no-unused-vars
      await Todo.addnotes({
        notes: request.body.notes,
        userId: request.user.id,
        id: id,
      });
      request.flash("success", "notes added succesfully!!");
      return response.redirect("/todo");
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

app.post(
  "/todo/:id/notes/update",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    let id = request.params.id;
    if (request.body.notes.length == 0) {
      request.flash("error", "notes can not be empty!!");
      return response.redirect(`/todos/${id}/note`);
    }

    try {
      // eslint-disable-next-line no-unused-vars
      await Todo.addnotes({
        notes: request.body.notes,
        userId: request.user.id,
        id: id,
      });
      request.flash("success", "notes updated succesfully!!");
      return response.redirect("/todo");
    } catch (error) {
      console.log(error);
      return response.status(422).json(error);
    }
  }
);

module.exports = app;
