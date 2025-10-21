import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectAdmin from "../middleware/protectAdmin";
import validatePostData from "../middleware/postValidation";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { getSupabase } from "../utils/supabase";

const router = Router();

// POST /posts - Create a new post
router.post("/", protectAdmin, validatePostData, asyncHandler(async (req: Request, res: Response) => {
  const newPost = req.body;
  const accessToken = (req as any).accessToken;
  
  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    const result = await supabaseRls.insert("posts", {
      title: newPost.title,
      image: newPost.image,
      category_id: newPost.category_id,
      description: newPost.description,
      content: newPost.content,
      status_id: newPost.status_id,
    });

    return res.status(201).json({ 
      success: true,
      message: "Created post successfully",
      data: result
    });
  } catch (error) {
    throw new DatabaseError("Failed to create post");
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
    let supabaseQuery = supabase
      .from("posts")
      .select(`
        *,
        categories(name),
        statuses(status)
      `)
      .eq("status_id", 2) // published posts only
      .order("date", { ascending: false })
      .range(offset, offset + safeLimit - 1);

    // เพิ่ม filters ถ้ามี
    if (category) {
      supabaseQuery = supabaseQuery.ilike("categories.name", `%${category}%`);
    }

    if (keyword) {
      supabaseQuery = supabaseQuery.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { data: posts, error } = await supabaseQuery;

    if (error) {
      throw new DatabaseError("Failed to fetch posts");
    }

    const results: any = {
      success: true,
      totalPosts: 0, // จะคำนวณใหม่ด้านล่าง
      totalPages: 0,
      currentPage: safePage,
      limit: safeLimit,
      posts: posts || [],
    };

    // นับจำนวน posts ทั้งหมดด้วย Supabase
    let countQuery = supabase
      .from("posts")
      .select("id", { count: "exact" })
      .eq("status_id", 2);

    if (category) {
      countQuery = countQuery.ilike("categories.name", `%${category}%`);
    }

    if (keyword) {
      countQuery = countQuery.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new DatabaseError("Failed to count posts");
    }

    const totalPosts = count || 0;
    results.totalPosts = totalPosts;
    results.totalPages = Math.ceil(totalPosts / safeLimit);
    
    if (offset + safeLimit < totalPosts) {
      results.nextPage = safePage + 1;
    }
    if (offset > 0) {
      results.previousPage = safePage - 1;
    }
    
    return res.status(200).json(results);
  } catch (error) {
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
    const { data: posts, error } = await supabase
      .from("posts")
      .select(`
        *,
        categories(name),
        statuses(status)
      `)
      .eq("id", postIdFromClient)
      .single();

    if (error || !posts) {
      throw new NotFoundError("Post", postIdFromClient);
    }

    return res.status(200).json({
      success: true,
      data: posts,
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
      "posts",
      {
        title: updatedPost.title,
        image: updatedPost.image,
        category_id: updatedPost.category_id,
        description: updatedPost.description,
        content: updatedPost.content,
        status_id: updatedPost.status_id,
        date: updatedPost.date,
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

// GET /posts/admin - Get all posts for admin (including drafts)
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
    let query = `
      *,
      categories(name),
      statuses(status)
    `;

    // Build filter conditions
    let filters: any = {};
    
    if (category) {
      // We'll need to filter by category name, so we'll do this in a separate query
    }
    
    if (status) {
      if (status.toLowerCase() === 'published') {
        filters.status_id = 2;
      } else if (status.toLowerCase() === 'draft') {
        filters.status_id = 1;
      }
    }

    // Get posts with basic filters
    const supabase = getSupabase();
    let supabaseQuery = supabase
      .from("posts")
      .select(query)
      .order("date", { ascending: false })
      .range(offset, offset + safeLimit - 1);

    // Apply status filter
    if (filters.status_id) {
      supabaseQuery = supabaseQuery.eq("status_id", filters.status_id);
    }

    // Apply keyword search
    if (keyword) {
      supabaseQuery = supabaseQuery.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { data: posts, error } = await supabaseQuery;

    if (error) {
      throw new DatabaseError("Failed to fetch posts");
    }

    // Filter by category if needed (post-processing since we need to filter by category name)
    let filteredPosts = posts || [];
    if (category) {
      filteredPosts = filteredPosts.filter((post: any) => 
        post.categories?.name?.toLowerCase().includes(category.toLowerCase())
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("posts")
      .select("id", { count: "exact" });

    if (filters.status_id) {
      countQuery = countQuery.eq("status_id", filters.status_id);
    }

    if (keyword) {
      countQuery = countQuery.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new DatabaseError("Failed to count posts");
    }

    const totalPosts = count || 0;
    const totalPages = Math.ceil(totalPosts / safeLimit);

    return res.status(200).json({
      success: true,
      posts: filteredPosts,
      pagination: {
        totalPosts,
        totalPages,
        currentPage: safePage,
        limit: safeLimit,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1
      }
    });
  } catch (error) {
    throw new DatabaseError("Failed to fetch posts");
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
      .from("posts")
      .select(`
        *,
        categories(id, name),
        statuses(id, status)
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

// GET /posts/stats - Get dashboard statistics (admin only)
router.get("/stats", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase();

  try {
    // Get total posts count
    const { count: totalPosts } = await supabase
      .from("posts")
      .select("id", { count: "exact" });

    // Get published posts count
    const { count: publishedPosts } = await supabase
      .from("posts")
      .select("id", { count: "exact" })
      .eq("status_id", 2);

    // Get draft posts count
    const { count: draftPosts } = await supabase
      .from("posts")
      .select("id", { count: "exact" })
      .eq("status_id", 1);

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
    const result = await supabaseRls.delete("posts", { id: postIdFromClient });

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
