import { Request, Response, NextFunction } from "express";
import { getSupabaseWithAuth } from "../utils/supabase";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";

// Middleware ตรวจสอบ JWT token และสิทธิ์ Admin
const protectAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1]; // ดึง token จาก Authorization header

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    // ใช้ Supabase client ที่มี auth context สำหรับตรวจสอบ token
    const supabase = getSupabaseWithAuth(token);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    // ดึง user ID จากข้อมูลผู้ใช้ Supabase
    const supabaseUserId = data.user.id;

    // ใช้ Supabase RLS helper สำหรับดึงข้อมูล role
    const supabaseRls = createSupabaseRlsHelper(token);
    const users = await supabaseRls.select("users", "role", { id: supabaseUserId });

    if (!users || users.length === 0) {
      return res.status(404).json({ error: "User role not found" });
    }

    // แนบข้อมูลผู้ใช้พร้อม role และ token เข้ากับ request object
    (req as any).user = { ...data.user, role: (users[0] as any).role };
    (req as any).accessToken = token;

    // ตรวจสอบว่าผู้ใช้เป็น admin หรือไม่
    if ((req as any).user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Forbidden: You do not have admin access" });
    }

    // ดำเนินการต่อไปยัง middleware หรือ route handler ถัดไป
    return next();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default protectAdmin;

