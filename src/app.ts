import express from "express";
import cors from "cors";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import postsRouter from "./routes/posts";
import profilesRouter from "./routes/profiles";
import authRouter from "./routes/auth";

const app = express();
const port: number = parseInt(process.env.PORT || "4001", 10);

app.use(cors());
app.use(express.json());

// Routes
app.use("/posts", postsRouter);
app.use("/profiles", profilesRouter);
app.use("/auth", authRouter);

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