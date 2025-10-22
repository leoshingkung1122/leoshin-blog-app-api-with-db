import { Router, Request, Response } from "express";
import protectUser from "../middleware/protectUser";
import { asyncHandler } from "../middleware/errorHandler";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { DatabaseError } from "../utils/errors";
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
        introduction: (users[0] as any).introduction,
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
  const { name, introduction, profile_pic } = req.body;

  try {
    const supabaseRls = createSupabaseRlsHelper(accessToken);
    
    // Get current user data from database first
    const currentUserData = await supabaseRls.select("users", "*", { id: user.id });
    if (!currentUserData || currentUserData.length === 0) {
      return res.status(404).json({ error: "User profile not found" });
    }
    
    const currentUser = currentUserData[0] as any;
    
    const updateData: any = {};

    // Username cannot be changed - only allow name updates
    if (name !== undefined && name !== '') {
      updateData.name = name;
    }

    // Update introduction if provided
    if (introduction !== undefined) {
      updateData.introduction = introduction;
    }

    // Update profile picture if provided (now using URL from Supabase Storage)
    if (profile_pic !== undefined) {
      updateData.profile_pic = profile_pic;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No data provided to update" });
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
      body: { name, introduction, profile_pic }
    });
    
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: errorMessage });
  }
}));

// POST /profiles/upload-image - Upload profile image directly
router.post("/upload-image", protectUser, upload.single('image'), asyncHandler(async (req: Request, res: Response) => {
    const accessToken = (req as any).accessToken;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, error: "No image file provided." });
    }

    try {
        const supabaseRls = createSupabaseRlsHelper(accessToken);
        const bucketName = "profile-images";
        const fileName = `profile-${Date.now()}-${file.originalname}`;
        const filePath = `public/${fileName}`;

        // Upload file to Supabase Storage
        const { data, error } = await supabaseRls.supabase.storage
            .from(bucketName)
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            throw new DatabaseError(`Failed to upload image: ${error.message}`);
        }

        // Get public URL
        const { data: publicURLData } = supabaseRls.supabase.storage
            .from(bucketName)
            .getPublicUrl(filePath);

        return res.status(200).json({ 
            success: true, 
            imageUrl: publicURLData.publicUrl,
            fileName: fileName
        });

    } catch (error) {
        if (error instanceof DatabaseError) {
            throw error;
        }
        throw new DatabaseError("Failed to upload image.");
    }
}));

export default router;
