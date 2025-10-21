import { Router, Request, Response } from "express";
import protectUser from "../middleware/protectUser";
import { asyncHandler } from "../middleware/errorHandler";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import multer from "multer";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  }
});

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
router.put("/", protectUser, upload.single('imageFile'), asyncHandler(async (req: Request, res: Response) => {
  const accessToken = (req as any).accessToken;
  const user = (req as any).user;
  const { username, name } = req.body;
  const imageFile = req.file;

  try {
    const supabaseRls = createSupabaseRlsHelper(accessToken);
    
    // ตรวจสอบว่า username ใหม่ไม่ซ้ำกับคนอื่น (ถ้ามีการเปลี่ยน)
    if (username && username !== (user as any).username) {
      const existingUsers = await supabaseRls.select("users", "id", { username });
      if (existingUsers && existingUsers.length > 0) {
        return res.status(400).json({ error: "Username is already taken" });
      }
    }

    const updateData: any = {
      username: username || undefined,
      name: name || undefined,
    };

    // ถ้ามีการอัปโหลดรูปภาพใหม่ ให้เก็บเป็น base64 (ชั่วคราว)
    if (imageFile) {
      const base64Image = imageFile.buffer.toString('base64');
      const dataUrl = `data:${imageFile.mimetype};base64,${base64Image}`;
      updateData.profile_pic = dataUrl;
    }

    const result = await supabaseRls.update(
      "users",
      updateData,
      { id: user.id }
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result
    });
  } catch (error) {
    console.error("Profile update error:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      user: user ? { id: user.id, email: user.email } : "No user data",
      body: { username, name },
      hasImageFile: !!imageFile
    });
    
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: errorMessage });
  }
}));

export default router;
