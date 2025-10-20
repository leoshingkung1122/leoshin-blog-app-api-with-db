import { Router, Request, Response } from "express";
import { getSupabase } from "../utils/supabase";
import protectUser from "../middleware/protectUser";

const authRouter = Router();

// จะเพิ่ม routes ต่างๆ ที่นี่

authRouter.post("/register", async (req: Request, res: Response) => {
    const { email, password, username, name } = req.body;
  
    try {
      // ตรวจสอบว่า username มีในฐานข้อมูลหรือไม่
      const supabase = getSupabase();
      const { data: existingUsers } = await supabase
        .from("users")
        .select("*")
        .eq("username", username);
  
      if (existingUsers && existingUsers.length > 0) {
        return res.status(400).json({ error: "This username is already taken" });
      }
  
      // สร้างผู้ใช้ใหม่ผ่าน Supabase Auth
      const { data, error: supabaseError } = await supabase.auth.signUp({
        email,
        password,
      });
  
      // ตรวจสอบ error จาก Supabase
      if (supabaseError) {
        if (supabaseError.code === "user_already_exists") {
          return res
            .status(400)
            .json({ error: "User with this email already exists" });
        }
        // จัดการกับ error อื่นๆ จาก Supabase
        return res
          .status(400)
          .json({ error: "Failed to create user. Please try again." });
      }

      // ตรวจสอบว่า data.user มีอยู่จริง
      if (!data.user) {
        return res.status(400).json({ error: "Failed to create user" });
      }
  
      const supabaseUserId = data.user.id;
  
      // เพิ่มข้อมูลผู้ใช้ในฐานข้อมูล PostgreSQL
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          id: supabaseUserId,
          username,
          name,
          role: "user"
        })
        .select()
        .single();

      if (insertError) {
        return res.status(500).json({ error: "Failed to create user profile" });
      }

      return res.status(201).json({
        message: "User created successfully",
        user: newUser,
      });
    } catch (error) {
      return res.status(500).json({ error: "An error occurred during registration" });
    }
  });
  
  authRouter.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
  
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
  
      if (error) {
        // ตรวจสอบว่า error เกิดจากข้อมูลเข้าสู่ระบบไม่ถูกต้องหรือไม่
        if (
          error.code === "invalid_credentials" ||
          error.message.includes("Invalid login credentials")
        ) {
          return res.status(400).json({
            error: "Your password is incorrect or this email doesn't exist",
          });
        }
        return res.status(400).json({ error: error.message });
      }

      // ตรวจสอบว่า data.session มีอยู่จริง
      if (!data.session) {
        return res.status(400).json({ error: "Failed to create session" });
      }
  
      return res.status(200).json({
        message: "Signed in successfully",
        access_token: data.session.access_token,
      });
    } catch (error) {
      return res.status(500).json({ error: "An error occurred during login" });
    }
  });

  authRouter.get("/get-user", protectUser, async (req: Request, res: Response) => {
    try {
      // ใช้ข้อมูลที่ middleware ได้แนบมาแล้ว
      const user = (req as any).user;
      const accessToken = (req as any).accessToken;

      // ใช้ Supabase RLS helper สำหรับดึงข้อมูลผู้ใช้
      const { createSupabaseRlsHelper } = await import("../utils/supabaseRls");
      const supabaseRls = createSupabaseRlsHelper(accessToken);
      
      const users = await supabaseRls.select("users", "*", { id: user.id });

      // ตรวจสอบว่า rows มีข้อมูล
      if (!users || users.length === 0) {
        return res.status(404).json({ error: "User data not found" });
      }

      return res.status(200).json({
        id: user.id,
        email: user.email,
        username: (users[0] as any).username,
        name: (users[0] as any).name,
        role: (users[0] as any).role,
        profilePic: (users[0] as any).profile_pic,
      });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  
export default authRouter;