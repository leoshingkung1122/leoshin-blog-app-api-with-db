import { Router, Request, Response } from "express";

const router = Router();

interface ProfileData {
  name: string;
  age: number;
}

interface ApiResponse {
  data: ProfileData;
}

// GET /profiles - Get profile information
router.get("/", (req: Request, res: Response<ApiResponse>) => {
  return res.json({
    data: {
      name: "john",
      age: 20,
    },
  });
});

export default router;
