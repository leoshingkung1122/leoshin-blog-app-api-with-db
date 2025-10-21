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
    const filteredDuplicates = duplicateCategories?.filter(cat => cat.id !== Number(categoryId)) || [];

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

    // Check if category is being used by any posts
    const postsWithCategory = await supabaseRls.select("blog_posts", "id", { category_id: categoryId });
    if (postsWithCategory && postsWithCategory.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: "Cannot delete category that is being used by posts" 
      });
    }

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
