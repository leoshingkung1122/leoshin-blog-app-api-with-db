import { Router, Request, Response } from "express";
import { getSupabase } from "../utils/supabase";
import connectionPool from "../utils/db";
import protectUser from "../middleware/protectUser";

const authRouter = Router();

// จะเพิ่ม routes ต่างๆ ที่นี่

authRouter.post("/register", async (req: Request, res: Response) => {
    const { email, password, username, name } = req.body;
  
    try {
      // ตรวจสอบว่า username มีในฐานข้อมูลหรือไม่
      const usernameCheckQuery = `
                                  SELECT * FROM users 
                                  WHERE username = $1
                                 `;
      const usernameCheckValues = [username];
      const { rows: existingUser } = await connectionPool.query(
        usernameCheckQuery,
        usernameCheckValues
      );
  
      if (existingUser.length > 0) {
        return res.status(400).json({ error: "This username is already taken" });
      }
  
      // สร้างผู้ใช้ใหม่ผ่าน Supabase Auth
      const supabase = getSupabase();
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
      const query = `
          INSERT INTO users (id, username, name, role)
          VALUES ($1, $2, $3, $4)
          RETURNING *;
        `;
  
      const values = [supabaseUserId, username, name, "user"];
  
      const { rows } = await connectionPool.query(query, values);
      return res.status(201).json({
        message: "User created successfully",
        user: rows[0],
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
    const token = req.headers.authorization?.split(" ")[1];
  
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Token missing" });
    }
  
    try {
      // ดึงข้อมูลผู้ใช้จาก Supabase
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.getUser(token);
      if (error) {
        return res.status(401).json({ error: "Unauthorized or token expired" });
      }

      // ตรวจสอบว่า data.user มีอยู่จริง
      if (!data.user) {
        return res.status(401).json({ error: "User not found" });
      }
  
      const supabaseUserId = data.user.id;
      const query = `
                      SELECT * FROM users 
                      WHERE id = $1
                    `;
      const values = [supabaseUserId];
      const { rows } = await connectionPool.query(query, values);

      // ตรวจสอบว่า rows มีข้อมูล
      if (!rows.length) {
        return res.status(404).json({ error: "User data not found" });
      }
  
      return res.status(200).json({
        id: data.user.id,
        email: data.user.email,
        username: rows[0].username,
        name: rows[0].name,
        role: rows[0].role,
        profilePic: rows[0].profile_pic,
      });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  
export default authRouter;