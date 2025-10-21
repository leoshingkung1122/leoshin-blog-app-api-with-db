import { Router, Request, Response } from "express";
import multer from "multer";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectAdmin from "../middleware/protectAdmin";
import validatePostData from "../middleware/postValidation";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { getSupabase } from "../utils/supabase";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit (increased from 5MB)
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// POST /posts - Create a new post
router.post("/", protectAdmin, upload.single('imageFile'), validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const newPost = req.body;
  const accessToken = (req as any).accessToken;
  const imageFile = req.file;
  
  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    let imageUrl = newPost.image; // Default to provided image URL

    // If image file is uploaded, upload it to Supabase Storage
    if (imageFile) {
      const fileName = `post-${Date.now()}-${imageFile.originalname}`;
      const uploadResult = await supabaseRls.uploadFile(
        'post-images',
        fileName,
        imageFile.buffer,
        imageFile.mimetype
      );

      imageUrl = uploadResult.path;
    }

    // Generate slug from title
    const generateSlug = (title: string) => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .trim();
    };

    const slug = generateSlug(newPost.title);

    console.log("Creating post with data:", {
      title: newPost.title,
      slug: slug,
      image: imageUrl,
      category_id: Number(newPost.category_id),
      author_id: (req as any).user?.id,
      description: newPost.description,
      content: newPost.content,
      status_id: Number(newPost.status_id),
      published_at: Number(newPost.status_id) === 1 ? new Date() : null,
    });

    const result = await supabaseRls.insert("blog_posts", {
      title: newPost.title,
      slug: slug, // Add slug field
      image: imageUrl,
      category_id: Number(newPost.category_id), // Convert string to number
      author_id: (req as any).user?.id, // Add author_id from authenticated user (UUID)
      description: newPost.description,
      content: newPost.content,
      status_id: Number(newPost.status_id), // Convert string to number
      published_at: Number(newPost.status_id) === 1 ? new Date() : null, // Set published_at if published
      // likes and views will use database defaults (0)
    });

    return res.status(201).json({ 
      success: true,
      message: "Created post successfully",
      data: result
    });
  } catch (error) {
    console.error("Error creating post:", error);
    throw new DatabaseError(`Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}));

// PUT /posts/:postId - Update an existing post
router.put("/:postId", protectAdmin, upload.single('imageFile'), validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  const updatedPost = req.body;
  const accessToken = (req as any).accessToken;
  const imageFile = req.file;
  
  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // First, get the existing post to check for old image
    const existingPost = await supabaseRls.select("blog_posts", "*", { id: postId });
    if (!existingPost || existingPost.length === 0) {
      throw new NotFoundError("Post", postId);
    }

    let imageUrl = updatedPost.image || (existingPost[0] as any).image; // Keep existing image if no new one provided

    // If new image file is uploaded, upload it and delete the old one
    if (imageFile) {
      const fileName = `post-${postId}-${Date.now()}-${imageFile.originalname}`;
      const uploadResult = await supabaseRls.uploadFile(
        'post-images',
        fileName,
        imageFile.buffer,
        imageFile.mimetype
      );

      imageUrl = uploadResult.path;

      // Delete old image if it exists and is not a placeholder
      const oldImageUrl = (existingPost[0] as any).image;
      if (oldImageUrl && !oldImageUrl.includes('via.placeholder.com') && !oldImageUrl.includes('default')) {
        try {
          // Extract filename from old image URL
          const oldFileName = oldImageUrl.split('/').pop();
          if (oldFileName) {
            await supabaseRls.deleteFile('post-images', oldFileName);
          }
        } catch (deleteError) {
          console.warn("Failed to delete old image:", deleteError);
          // Don't throw error, just log warning
        }
      }
    }

    // Generate slug from title
    const generateSlug = (title: string) => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .trim();
    };

    const slug = generateSlug(updatedPost.title);

    const result = await supabaseRls.update("blog_posts", {
      title: updatedPost.title,
      slug: slug, // Add slug field
      image: imageUrl,
      category_id: Number(updatedPost.category_id), // Convert string to number
      description: updatedPost.description,
      content: updatedPost.content,
      status_id: Number(updatedPost.status_id), // Convert string to number
      published_at: Number(updatedPost.status_id) === 1 ? new Date() : null,
      updated_at: new Date()
    }, { id: postId });

    return res.status(200).json({ 
      success: true,
      message: "Updated post successfully",
      data: result
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to update post");
  }
}));

// GET /posts/admin - Get all posts for admin (including drafts) - MUST BE BEFORE /:postId
router.get("/admin", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category as string || "";
  const keyword = req.query.keyword as string || "";
  const status = req.query.status as string || "";
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const accessToken = (req as any).accessToken;

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const offset = (safePage - 1) * safeLimit;

  const supabase = getSupabase();

  try {
    let supabaseQuery = supabase
      .from("blog_posts")
      .select(`
        id,
        title,
        description,
        content,
        categories(name),
        post_status(name),
        created_at,
        updated_at
      `)
      .order("created_at", { ascending: false });

    // Apply status filter
    if (status) {
      if (status.toLowerCase() === 'published') {
        supabaseQuery = supabaseQuery.eq("status_id", 1);
      } else if (status.toLowerCase() === 'draft') {
        supabaseQuery = supabaseQuery.eq("status_id", 2);
      }
    }

    // Apply keyword search
    if (keyword) {
      supabaseQuery = supabaseQuery.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { data: posts, error } = await supabaseQuery;

    if (error) {
      console.error("Admin posts query error:", error);
      throw new DatabaseError("Failed to fetch posts");
    }

    // Transform data to match frontend expectations
    const transformedPosts = (posts || []).map((post: any) => ({
      id: post.id,
      title: post.title,
      description: post.description,
      content: post.content,
      category: post.categories?.name || 'Uncategorized',
      status: post.post_status?.name?.toLowerCase() || 'unknown'
    }));

    // Filter by category if needed (post-processing)
    let filteredPosts = transformedPosts;
    if (category) {
      filteredPosts = filteredPosts.filter((post: any) => 
        post.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    return res.status(200).json({
      success: true,
      posts: filteredPosts,
      totalPosts: filteredPosts.length
    });
  } catch (error) {
    console.error("Admin posts route error:", error);
    throw new DatabaseError("Failed to fetch posts");
  }
}));

// GET /posts/stats - Get dashboard statistics (admin only)
router.get("/stats", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase();

  try {
    // Get total posts count
    const { count: totalPosts } = await supabase
      .from("blog_posts")
      .select("id", { count: "exact" });

    // Get published posts count
    const { count: publishedPosts } = await supabase
      .from("blog_posts")
      .select("id", { count: "exact" })
      .eq("status_id", 1); // Published = 1

    // Get draft posts count
    const { count: draftPosts } = await supabase
      .from("blog_posts")
      .select("id", { count: "exact" })
      .eq("status_id", 2); // Draft = 2

    // Get total categories count
    const { count: totalCategories } = await supabase
      .from("categories")
      .select("id", { count: "exact" });

    // Get total users count
    const { count: totalUsers } = await supabase
      .from("users")
      .select("id", { count: "exact" });

    // Get total comments count (if you have a comments table)
    // For now, we'll set it to 0 since we don't have a comments table yet
    const totalComments = 0;

    return res.status(200).json({
      success: true,
      data: {
        totalPosts: totalPosts || 0,
        publishedPosts: publishedPosts || 0,
        draftPosts: draftPosts || 0,
        totalCategories: totalCategories || 0,
        totalUsers: totalUsers || 0,
        totalComments: totalComments
      }
    });
  } catch (error) {
    throw new DatabaseError("Failed to fetch statistics");
  }
}));

// GET /posts/admin/:postId - Get a specific post for admin (including drafts)
router.get("/admin/:postId", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;
  const accessToken = (req as any).accessToken;

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  const supabase = getSupabase();
  
  try {
    const { data: post, error } = await supabase
      .from("blog_posts")
      .select(`
        *,
        categories(id, name),
        post_status(id, name)
      `)
      .eq("id", postIdFromClient)
      .single();

    if (error || !post) {
      throw new NotFoundError("Post", postIdFromClient);
    }

    return res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch post");
  }
}));

// GET /posts - Get all posts with pagination and filtering
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category as string || "";
  const keyword = req.query.keyword as string || "";
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 6;

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const offset = (safePage - 1) * safeLimit;

  // ใช้ Supabase client สำหรับ public route
  const supabase = getSupabase();

  try {
    // Query using correct table name: blog_posts
    let supabaseQuery = supabase
      .from("blog_posts")
      .select(`
        *,
        categories(name),
        post_status(name)
      `)
      .eq("status_id", 1) // Published posts (status_id = 1 for Published)
      .order("published_at", { ascending: false })
      .range(offset, offset + safeLimit - 1);

    // Apply keyword search
    if (keyword) {
      supabaseQuery = supabaseQuery.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { data: posts, error } = await supabaseQuery;

    if (error) {
      console.error("Supabase error:", error);
      throw new DatabaseError(`Failed to fetch posts: ${error.message}`);
    }

    // Filter by category if needed (post-processing)
    let filteredPosts = posts || [];
    if (category) {
      filteredPosts = filteredPosts.filter((post: any) => 
        post.categories?.name?.toLowerCase().includes(category.toLowerCase())
      );
    }

    // Get total count
    let countQuery = supabase
      .from("blog_posts")
      .select("id", { count: "exact" })
      .eq("status_id", 1);

    if (keyword) {
      countQuery = countQuery.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      console.error("Count error:", countError);
      throw new DatabaseError(`Failed to count posts: ${countError.message}`);
    }

    const totalPosts = count || 0;
    const totalPages = Math.ceil(totalPosts / safeLimit);

    return res.status(200).json({
      success: true,
      totalPosts,
      totalPages,
      currentPage: safePage,
      limit: safeLimit,
      posts: filteredPosts,
      nextPage: safePage < totalPages ? safePage + 1 : null,
      previousPage: safePage > 1 ? safePage - 1 : null
    });
  } catch (error) {
    console.error("Route error:", error);
    throw new DatabaseError("Failed to fetch posts");
  }
}));

// GET /posts/:postId - Get a specific post by ID
router.get("/:postId", asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  const supabase = getSupabase();
  
  try {
    const { data: post, error } = await supabase
      .from("blog_posts")
      .select(`
        *,
        categories(name),
        post_status(name)
      `)
      .eq("id", postIdFromClient)
      .eq("status_id", 1) // Only published posts
      .single();

    if (error || !post) {
      throw new NotFoundError("Post", postIdFromClient);
    }

    return res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch post");
  }
}));

// PUT /posts/:postId - Update a specific post
router.put("/:postId", protectAdmin, validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;
  const updatedPost = { ...req.body, date: new Date() };
  const accessToken = (req as any).accessToken;

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    const result = await supabaseRls.update(
      "blog_posts",
      {
        title: updatedPost.title,
        image: updatedPost.image,
        category_id: updatedPost.category_id,
        description: updatedPost.description,
        content: updatedPost.content,
        status_id: updatedPost.status_id,
        published_at: updatedPost.status_id === 1 ? new Date() : null, // Set published_at if published
        updated_at: new Date(),
      },
      { id: postIdFromClient }
    );

    return res.status(200).json({
      success: true,
      message: "Updated post successfully",
      data: result
    });
  } catch (error) {
    throw new DatabaseError("Failed to update post");
  }
}));


// DELETE /posts/:postId - Delete a specific post
router.delete("/:postId", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;
  const accessToken = (req as any).accessToken;

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    const result = await supabaseRls.delete("blog_posts", { id: postIdFromClient });

    return res.status(200).json({
      success: true,
      message: "Deleted post successfully",
      data: result
    });
  } catch (error) {
    throw new DatabaseError("Failed to delete post");
  }
}));

export default router;
