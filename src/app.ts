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

app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});
