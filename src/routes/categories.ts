import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectAdmin from "../middleware/protectAdmin";
import { createSupabaseRlsHelper, createSupabaseAdminHelper } from "../utils/supabaseRls";
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

    // Generate slug from name
    const generateSlug = (name: string) => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .trim();
    };

    const slug = generateSlug(name.trim());

    const result = await supabaseRls.insert("categories", {
      name: name.trim(),
      slug: slug,
    });

    return res.status(201).json({ 
      success: true,
      message: "Created category successfully",
      data: result
    });
  } catch (error) {
    console.error("Error creating category:", error);
    throw new DatabaseError(`Failed to create category: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Generate slug from name
    const generateSlug = (name: string) => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .trim();
    };

    const slug = generateSlug(name.trim());

    const result = await supabaseRls.update(
      "categories",
      { 
        name: name.trim(),
        slug: slug,
      },
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

  console.log(`🚀 Starting delete operation for category ID: ${categoryId}`);
  
  // Use Admin helper for delete operations (bypass RLS)
  const supabaseAdmin = createSupabaseAdminHelper();

  try {
    console.log(`🔍 Step 1: Checking if category ${categoryId} exists`);
    // Check if category exists
    const existingCategory = await supabaseAdmin.select("categories", "*", { id: categoryId });
    if (!existingCategory || existingCategory.length === 0) {
      throw new NotFoundError("Category", categoryId);
    }

    console.log(`📄 Step 2: Getting posts with category ${categoryId}`);
    // Get all posts with this category to clean up related data first
    const postsWithCategory = await supabaseAdmin.select("blog_posts", "*", { category_id: categoryId });
    
    console.log(`Found ${postsWithCategory?.length || 0} posts with this category`);
    
    // Clean up related data for posts in this category (comments and post_likes)
    if (postsWithCategory && postsWithCategory.length > 0) {
      for (const post of postsWithCategory) {
        console.log(`🧹 Cleaning up data for post ${(post as any).id}`);
        // Delete related comments first
        await supabaseAdmin.delete("comments", { post_id: (post as any).id });
        // Delete related post_likes
        await supabaseAdmin.delete("post_likes", { post_id: (post as any).id });
        // Note: Posts will be deleted automatically due to ON DELETE CASCADE constraint
      }
    }

    console.log(`🗂️ Step 3: Deleting category ${categoryId}`);
    // Now delete the category (posts will be deleted automatically due to CASCADE)
    const result = await supabaseAdmin.delete("categories", { id: categoryId });
    
    console.log(`✅ Category deletion completed successfully:`, result);

    return res.status(200).json({
      success: true,
      message: "Deleted category successfully",
      data: result
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}));

export default router;
