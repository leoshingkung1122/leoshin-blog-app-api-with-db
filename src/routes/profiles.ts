import { Router, Request, Response } from "express";
import protectUser from "../middleware/protectUser";
import { asyncHandler } from "../middleware/errorHandler";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";

const router = Router();

// GET /profiles - Get current user profile (Protected)
router.get("/", protectUser, asyncHandler(async (req: Request, res: Response) => {
  const accessToken = (req as any).accessToken;
  const user = (req as any).user;

  try {
    const supabaseRls = createSupabaseRlsHelper(accessToken);
    const users = await supabaseRls.select("users", "*", { id: user.id });

    if (!users || users.length === 0) {
      return res.status(404).json({ error: "User profile not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: (users[0] as any).username,
        name: (users[0] as any).name,
        role: (users[0] as any).role,
        profilePic: (users[0] as any).profile_pic,
      }
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}));

// PUT /profiles - Update current user profile (Protected)
router.put("/", protectUser, asyncHandler(async (req: Request, res: Response) => {
  const accessToken = (req as any).accessToken;
  const user = (req as any).user;
  const { username, name, profile_pic } = req.body;

  try {
    const supabaseRls = createSupabaseRlsHelper(accessToken);
    
    // ตรวจสอบว่า username ใหม่ไม่ซ้ำกับคนอื่น (ถ้ามีการเปลี่ยน)
    if (username && username !== user.username) {
      const existingUsers = await supabaseRls.select("users", "id", { username });
      if (existingUsers && existingUsers.length > 0) {
        return res.status(400).json({ error: "Username is already taken" });
      }
    }

    const result = await supabaseRls.update(
      "users",
      {
        username: username || undefined,
        name: name || undefined,
        profile_pic: profile_pic || undefined,
      },
      { id: user.id }
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}));

export default router;
