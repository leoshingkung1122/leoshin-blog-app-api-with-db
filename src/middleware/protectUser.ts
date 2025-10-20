import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || ""
);

// Middleware ตรวจสอบ JWT token และดึง user_id
const protectUser = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1]; // ดึง token จาก Authorization header

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    // ใช้ Supabase ตรวจสอบ token และดึงข้อมูลผู้ใช้
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // แนบข้อมูลผู้ใช้เข้ากับ request object
    (req as any).user = { ...data.user };

    // ดำเนินการต่อไปยัง middleware หรือ route handler ถัดไป
    return next();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default protectUser;

