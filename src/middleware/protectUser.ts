import { Request, Response, NextFunction } from "express";
import { getSupabase, getSupabaseWithAuth } from "../utils/supabase";

// Middleware ตรวจสอบ JWT token และดึง user_id
const protectUser = async (req: Request, res: Response, next: NextFunction) => {
  console.log("ProtectUser middleware hit:", {
    method: req.method,
    url: req.url,
    authorization: req.headers.authorization
  });
  
  const token = req.headers.authorization?.split(" ")[1]; // ดึง token จาก Authorization header

  if (!token) {
    console.log("No token found");
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    console.log("Validating token with Supabase...");
    // ใช้ Supabase client ที่มี auth context สำหรับตรวจสอบ token
    const supabase = getSupabaseWithAuth(token);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      console.log("Token validation failed:", error?.message);
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    console.log("Token validation successful:", { userId: data.user.id, email: data.user.email });
    // แนบข้อมูลผู้ใช้และ token เข้ากับ request object
    (req as any).user = { ...data.user };
    (req as any).accessToken = token;

    // ดำเนินการต่อไปยัง middleware หรือ route handler ถัดไป
    return next();
  } catch (err) {
    console.log("ProtectUser middleware error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default protectUser;

