import express from "express";
import cors from "cors";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import postsRouter from "./routes/posts";
import profilesRouter from "./routes/profiles";
import authRouter from "./routes/auth";
import categoriesRouter from "./routes/categories";
import commentsRouter from "./routes/comments";
import likesRouter from "./routes/likes";
import notificationsRouter from "./routes/notifications";
import usersRouter from "./routes/users";

const app = express();
const port: number = parseInt(process.env.PORT || "4001", 10);

app.use(cors({
  origin: ['https://leo-shin-blog-app.vercel.app/', 'http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Root route for testing
app.get("/", (req, res) => {
  res.json({ message: "LeoShin Blog API is running!", status: "success" });
});

// Routes
app.use("/posts", postsRouter);
app.use("/profiles", profilesRouter);
app.use("/auth", authRouter);
app.use("/categories", categoriesRouter);
app.use("/comments", commentsRouter);
app.use("/likes", likesRouter);
app.use("/notifications", notificationsRouter);
app.use("/users", usersRouter);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Export the app for Vercel
export default app;

// Only start the server if running locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });
}