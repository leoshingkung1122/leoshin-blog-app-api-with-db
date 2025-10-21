import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectAdmin from "../middleware/protectAdmin";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { getSupabase } from "../utils/supabase";

const router = Router();

// GET /categories - Get all categories (public)
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase();
  
  try {
    const { data: categories, error } = await supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      throw new DatabaseError("Failed to fetch categories");
    }

    return res.status(200).json({
      success: true,
      data: categories || [],
    });
  } catch (error) {
    throw new DatabaseError("Failed to fetch categories");
  }
}));

// GET /categories/:categoryId - Get a specific category by ID
router.get("/:categoryId", asyncHandler(async (req: Request, res: Response) => {
  const categoryId = req.params.categoryId;

  // Validate categoryId parameter
  if (!categoryId || isNaN(Number(categoryId))) {
    throw new ValidationError("Invalid category ID");
  }

  const supabase = getSupabase();
  
  try {
    const { data: category, error } = await supabase
      .from("categories")
      .select("*")
      .eq("id", categoryId)
      .single();

    if (error || !category) {
      throw new NotFoundError("Category", categoryId);
    }

    return res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to fetch category");
  }
}));

// POST /categories - Create a new category (admin only)
router.post("/", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  const accessToken = (req as any).accessToken;

  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError("Category name is required");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Check if category already exists
    const existingCategories = await supabaseRls.select("categories", "*", { name: name.trim() });
    if (existingCategories && existingCategories.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: "Category with this name already exists" 
      });
    }

    const result = await supabaseRls.insert("categories", {
      name: name.trim(),
    });

    return res.status(201).json({ 
      success: true,
      message: "Created category successfully",
      data: result
    });
  } catch (error) {
    throw new DatabaseError("Failed to create category");
  }
}));

// PUT /categories/:categoryId - Update a specific category (admin only)
router.put("/:categoryId", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const categoryId = req.params.categoryId;
  const { name } = req.body;
  const accessToken = (req as any).accessToken;

  // Validate categoryId parameter
  if (!categoryId || isNaN(Number(categoryId))) {
    throw new ValidationError("Invalid category ID");
  }

  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError("Category name is required");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Check if category exists
    const existingCategory = await supabaseRls.select("categories", "*", { id: categoryId });
    if (!existingCategory || existingCategory.length === 0) {
      throw new NotFoundError("Category", categoryId);
    }

    // Check if another category with the same name exists (excluding current category)
    const duplicateCategories = await supabaseRls.select("categories", "*", { name: name.trim() });
    
    // Check if duplicateCategories is an error
    if (duplicateCategories && typeof duplicateCategories === 'object' && 'error' in duplicateCategories) {
      throw new DatabaseError(`Failed to check duplicate categories: ${duplicateCategories.error}`);
    }
    
    const filteredDuplicates = Array.isArray(duplicateCategories) 
      ? duplicateCategories.filter((cat: any) => cat.id !== Number(categoryId)) 
      : [];

    if (filteredDuplicates.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: "Category with this name already exists" 
      });
    }

    const result = await supabaseRls.update(
      "categories",
      { name: name.trim() },
      { id: categoryId }
    );

    return res.status(200).json({
      success: true,
      message: "Updated category successfully",
      data: result
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to update category");
  }
}));

// DELETE /categories/:categoryId - Delete a specific category (admin only)
router.delete("/:categoryId", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const categoryId = req.params.categoryId;
  const accessToken = (req as any).accessToken;

  // Validate categoryId parameter
  if (!categoryId || isNaN(Number(categoryId))) {
    throw new ValidationError("Invalid category ID");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Check if category exists
    const existingCategory = await supabaseRls.select("categories", "*", { id: categoryId });
    if (!existingCategory || existingCategory.length === 0) {
      throw new NotFoundError("Category", categoryId);
    }

    // Get all posts with this category to delete them first
    const postsWithCategory = await supabaseRls.select("blog_posts", "*", { category_id: categoryId });
    
    // Delete all posts with this category first (cascading delete)
    if (postsWithCategory && postsWithCategory.length > 0) {
      for (const post of postsWithCategory) {
        // Delete related comments first
        await supabaseRls.delete("comments", { post_id: (post as any).id });
        // Delete related post_likes
        await supabaseRls.delete("post_likes", { post_id: (post as any).id });
        // Delete the post
        await supabaseRls.delete("blog_posts", { id: (post as any).id });
      }
    }

    // Now delete the category
    const result = await supabaseRls.delete("categories", { id: categoryId });

    return res.status(200).json({
      success: true,
      message: "Deleted category successfully",
      data: result
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError("Failed to delete category");
  }
}));

export default router;
