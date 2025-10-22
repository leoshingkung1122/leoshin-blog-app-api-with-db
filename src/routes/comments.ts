import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectUser from "../middleware/protectUser";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { getSupabase } from "../utils/supabase";
import { createNotification, getPostAuthorId } from "../utils/notificationHelper";

const router = Router();

// GET /comments/:postId - Get all comments for a specific post with pagination
router.get("/:postId", asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  
  // Parse and validate pagination parameters
  const pageParam = req.query.page as string;
  const limitParam = req.query.limit as string;
  
  const page = pageParam ? parseInt(pageParam) : 1;
  const limit = limitParam ? parseInt(limitParam) : 5;

  // Validate postId parameter
  if (!postId || isNaN(Number(postId))) {
    throw new ValidationError("Invalid post ID");
  }

  // Validate pagination parameters
  if (isNaN(page) || page < 1) {
    throw new ValidationError("Page must be a positive integer");
  }
  if (isNaN(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("Limit must be between 1 and 100");
  }

  // Use public Supabase client for getting comments (no authentication required)
  const supabase = getSupabase();

  try {
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count of comments for this post (optimized query)
    const { count: totalCount, error: countError } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    if (countError) {
      console.error("Supabase count error:", countError);
      throw new DatabaseError(`Failed to count comments: ${countError.message}`);
    }

    // Get paginated comments with user information
    const { data: comments, error } = await supabase
      .from("comments")
      .select(`
        id,
        post_id,
        user_id,
        parent_id,
        name,
        email,
        comment,
        image,
        created_at,
        updated_at,
        users!user_id(
          id,
          name,
          username,
          profile_pic
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Supabase error:", error);
      throw new DatabaseError(`Failed to fetch comments: ${error.message}`);
    }

    // Calculate pagination metadata
    const totalItems = totalCount || 0;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 1;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Handle case where page exceeds total pages
    if (page > totalPages && totalPages > 0) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
        data: [],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPrevPage: page > 1
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: comments || [],
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage
      }
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    throw new DatabaseError("Failed to fetch comments");
  }
}));

// POST /comments - Create a new comment
router.post("/", protectUser, asyncHandler(async (req: Request, res: Response) => {
  const { post_id, parent_id, comment } = req.body;
  const accessToken = (req as any).accessToken;
  const userId = (req as any).user?.id;

  // Validate required fields
  if (!post_id || !comment) {
    throw new ValidationError("Post ID and comment are required");
  }

  if (!userId) {
    throw new ValidationError("User authentication required");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Get user info for the comment
    const user = await supabaseRls.select("users", "name, username, profile_pic", { id: userId });
    
    if (!user || user.length === 0) {
      throw new ValidationError("User not found");
    }

    const userData = user[0] as any;

    const newComment = await supabaseRls.insert("comments", {
      post_id: Number(post_id),
      user_id: userId,
      parent_id: parent_id ? Number(parent_id) : null,
      name: userData.name || userData.username || "Anonymous",
      email: null, // We don't store email for logged-in users
      comment: comment.trim(),
      image: userData.profile_pic || null
    });

    // Create notification for admin when someone comments
    try {
      console.log('🔔 Starting notification creation for comment...');
      
      // Get first admin user ID (just one notification for all admins)
      const adminUsers = await supabaseRls.select("users", "id", { role: 'admin' });
      console.log('👥 Found admin users:', adminUsers);
      
      if (adminUsers && adminUsers.length > 0) {
        const firstAdmin = adminUsers[0] as any;
        console.log('📤 Sending notification to admin:', firstAdmin.id);
        
        const notificationResult = await createNotification(
          firstAdmin.id,
          "New Comment",
          `${userData.name || userData.username} commented on post: "${comment.trim()}"`,
          'comment',
          Number(post_id),
          newComment[0]?.id,
          userId
        );
        
        console.log('📬 Notification result:', notificationResult);
      } else {
        console.log('⚠️ No admin users found');
      }
    } catch (notificationError) {
      console.error('❌ Error creating notification:', notificationError);
      // Don't fail the comment creation if notification fails
    }

    return res.status(201).json({
      success: true,
      message: "Comment created successfully",
      data: newComment
    });
  } catch (error) {
    console.error("Error creating comment:", error);
    throw new DatabaseError("Failed to create comment");
  }
}));

// PUT /comments/:commentId - Update a comment
router.put("/:commentId", protectUser, asyncHandler(async (req: Request, res: Response) => {
  const commentId = req.params.commentId;
  const { comment } = req.body;
  const accessToken = (req as any).accessToken;
  const userId = (req as any).user?.id;

  // Validate required fields
  if (!comment) {
    throw new ValidationError("Comment content is required");
  }

  if (!userId) {
    throw new ValidationError("User authentication required");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // First check if the comment exists and belongs to the user
    const existingComment = await supabaseRls.select("comments", "id, user_id", { id: commentId });
    
    if (!existingComment || existingComment.length === 0) {
      throw new NotFoundError("Comment", commentId);
    }

    const commentData = existingComment[0] as any;
    if (commentData.user_id !== userId) {
      throw new ValidationError("You can only edit your own comments");
    }

    const updatedComment = await supabaseRls.update("comments", {
      comment: comment.trim(),
      updated_at: new Date()
    }, { id: commentId });

    return res.status(200).json({
      success: true,
      message: "Comment updated successfully",
      data: updatedComment
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    console.error("Error updating comment:", error);
    throw new DatabaseError("Failed to update comment");
  }
}));

// DELETE /comments/:commentId - Delete a comment
router.delete("/:commentId", protectUser, asyncHandler(async (req: Request, res: Response) => {
  const commentId = req.params.commentId;
  const accessToken = (req as any).accessToken;
  const userId = (req as any).user?.id;

  if (!userId) {
    throw new ValidationError("User authentication required");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // First check if the comment exists and belongs to the user
    const existingComment = await supabaseRls.select("comments", "id, user_id", { id: commentId });
    
    if (!existingComment || existingComment.length === 0) {
      throw new NotFoundError("Comment", commentId);
    }

    const commentData = existingComment[0] as any;
    if (commentData.user_id !== userId) {
      throw new ValidationError("You can only delete your own comments");
    }

    await supabaseRls.delete("comments", { id: commentId });

    return res.status(200).json({
      success: true,
      message: "Comment deleted successfully"
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    console.error("Error deleting comment:", error);
    throw new DatabaseError("Failed to delete comment");
  }
}));

export default router;
