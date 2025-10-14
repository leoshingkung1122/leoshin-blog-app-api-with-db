import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
const port: number = parseInt(process.env.PORT || "4001", 10);

app.use(cors());
app.use(express.json());

interface ProfileData {
  name: string;
  age: number;
}

interface ApiResponse {
  data: ProfileData;
}

app.get("/profiles", (req: Request, res: Response<ApiResponse>) => {
  return res.json({
    data: {
      name: "john",
      age: 20,
    },
  });
});

// Export the app for Vercel
export default app;

// Only start the server if running locally
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });
}
