import { Router, Request, Response } from "express";
import multer from "multer";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectAdmin from "../middleware/protectAdmin";
import validatePostData from "../middleware/postValidation";
import { createSupabaseRlsHelper, createSupabaseAdminHelper } from "../utils/supabaseRls";
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
router.post("/", protectAdmin, validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const newPost = req.body;
  const accessToken = (req as any).accessToken;
  
  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
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
      image: newPost.image,
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
      image: newPost.image,
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
router.put("/:postId", protectAdmin, validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  const updatedPost = req.body;
  const accessToken = (req as any).accessToken;
  
  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
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
      image: updatedPost.image,
      category_id: Number(updatedPost.category_id), // Convert string to number
      description: updatedPost.description,
      content: updatedPost.content,
      status_id: Number(updatedPost.status_id), // Convert string to number
      published_at: Number(updatedPost.status_id) === 1 ? new Date() : null,
      last_edited_by: (req as any).user?.id, // Track who last edited the post
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

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Get total count first
    const allPosts = await supabaseRls.select("blog_posts", `
      id,
      title,
      description,
      content,
      status_id,
      categories(name),
      post_status(name),
      created_at,
      updated_at
    `, {}, {
      orderBy: "created_at:desc"
    });

    // Apply filters
    let filteredPosts = allPosts;
    if (status) {
      if (status.toLowerCase() === 'published') {
        filteredPosts = allPosts.filter((post: any) => post.status_id === 1);
      } else if (status.toLowerCase() === 'draft') {
        filteredPosts = allPosts.filter((post: any) => post.status_id === 2);
      }
    }

    if (keyword) {
      filteredPosts = filteredPosts.filter((post: any) => 
        post.title.toLowerCase().includes(keyword.toLowerCase()) ||
        post.description.toLowerCase().includes(keyword.toLowerCase()) ||
        post.content.toLowerCase().includes(keyword.toLowerCase())
      );
    }

    // Transform data
    const transformedPosts = filteredPosts.map((post: any) => ({
      id: post.id,
      title: post.title,
      description: post.description,
      content: post.content,
      category: post.categories?.name || 'Uncategorized',
      status: post.post_status?.name?.toLowerCase() || 'unknown'
    }));

    // Filter by category
    let finalPosts = transformedPosts;
    if (category) {
      finalPosts = transformedPosts.filter((post: any) => 
        post.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    // Apply pagination
    const totalPosts = finalPosts.length;
    const totalPages = Math.ceil(totalPosts / safeLimit);
    const paginatedPosts = finalPosts.slice(offset, offset + safeLimit);

    return res.status(200).json({
      success: true,
      posts: paginatedPosts,
      pagination: {
        currentPage: safePage,
        totalPages: totalPages,
        totalPosts: totalPosts,
        limit: safeLimit,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1
      }
    });
  } catch (error) {
    console.error("Admin posts route error:", error);
    throw new DatabaseError("Failed to fetch posts");
  }
}));

// GET /posts/stats - Get dashboard statistics (admin only)
router.get("/stats", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const accessToken = (req as any).accessToken;
  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Get total posts count
    const totalPosts = await supabaseRls.select("blog_posts", "id");
    const totalPostsCount = totalPosts ? totalPosts.length : 0;

    // Get published posts count
    const publishedPosts = await supabaseRls.select("blog_posts", "id", { status_id: 1 });
    const publishedPostsCount = publishedPosts ? publishedPosts.length : 0;

    // Get draft posts count
    const draftPosts = await supabaseRls.select("blog_posts", "id", { status_id: 2 });
    const draftPostsCount = draftPosts ? draftPosts.length : 0;

    // Get total categories count
    const totalCategories = await supabaseRls.select("categories", "id");
    const totalCategoriesCount = totalCategories ? totalCategories.length : 0;

    // Get total users count
    const totalUsers = await supabaseRls.select("users", "id");
    const totalUsersCount = totalUsers ? totalUsers.length : 0;

    // Get total comments count (if you have a comments table)
    // For now, we'll set it to 0 since we don't have a comments table yet
    const totalComments = 0;

    return res.status(200).json({
      success: true,
      data: {
        totalPosts: totalPostsCount,
        publishedPosts: publishedPostsCount,
        draftPosts: draftPostsCount,
        totalCategories: totalCategoriesCount,
        totalUsers: totalUsersCount,
        totalComments: totalComments
      }
    });
  } catch (error) {
    console.error("Stats API error:", error);
    throw new DatabaseError("Failed to fetch statistics");
  }
}));

// POST /posts/upload-image - Upload image directly
router.post("/upload-image", protectAdmin, upload.single('image'), asyncHandler(async (req: Request, res: Response) => {
    const accessToken = (req as any).accessToken;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ success: false, error: "No image file provided." });
    }

    try {
        const supabaseRls = createSupabaseRlsHelper(accessToken);
        const bucketName = "post-images";
        const fileName = `post-${Date.now()}-${file.originalname}`;
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

// GET /posts/admin/:postId - Get a specific post for admin (including drafts)
router.get("/admin/:postId", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const postIdFromClient = req.params.postId;
  const accessToken = (req as any).accessToken;

  // Validate postId parameter
  if (!postIdFromClient || isNaN(Number(postIdFromClient))) {
    throw new ValidationError("Invalid post ID");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);
  
  try {
    const posts = await supabaseRls.select("blog_posts", `
      *,
      categories(id, name),
      post_status(id, name)
    `, { id: postIdFromClient });

    if (!posts || posts.length === 0) {
      throw new NotFoundError("Post", postIdFromClient);
    }

    return res.status(200).json({
      success: true,
      data: posts[0],
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

  // ใช้ Supabase client สำหรับ public route (ไม่ต้องใช้ RLS เพราะเป็น public data)
  const supabase = getSupabase();

  try {
    // Query using correct table name: blog_posts
    let supabaseQuery = supabase
      .from("blog_posts")
      .select(`
        *,
        categories(name),
        post_status(name),
        users!author_id(name, username, profile_pic, introduction)
        last_editor:users!last_edited_by(name, username, profile_pic)
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

  // ใช้ Supabase client สำหรับ public route (ไม่ต้องใช้ RLS เพราะเป็น public data)
  const supabase = getSupabase();
  
  try {
    const { data: post, error } = await supabase
      .from("blog_posts")
      .select(`
        *,
        categories(name),
        post_status(name),
        users!author_id(name, username, profile_pic, introduction),
        last_editor:users!last_edited_by(name, username, profile_pic)
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
        last_edited_by: (req as any).user?.id, // Track who last edited the post
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

  // Use Admin helper for delete operations (bypass RLS)
  const supabaseAdmin = createSupabaseAdminHelper();

  try {
    // Delete related comments first
    await supabaseAdmin.delete("comments", { post_id: postIdFromClient });
    
    // Delete related post_likes
    await supabaseAdmin.delete("post_likes", { post_id: postIdFromClient });
    
    // Finally delete the post
    const result = await supabaseAdmin.delete("blog_posts", { id: postIdFromClient });

    return res.status(200).json({
      success: true,
      message: "Deleted post successfully",
      data: result
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    throw new DatabaseError("Failed to delete post");
  }
}));

export default router;
