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
