import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectUser from "../middleware/protectUser";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { getSupabase } from "../utils/supabase";
import { createNotification, getPostAuthorId } from "../utils/notificationHelper";

const router = Router();

// GET /comments/:postId - Get all comments for a specific post
router.get("/:postId", asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId;

  // Validate postId parameter
  if (!postId || isNaN(Number(postId))) {
    throw new ValidationError("Invalid post ID");
  }

  // Use public Supabase client for getting comments (no authentication required)
  const supabase = getSupabase();

  try {
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
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      throw new DatabaseError(`Failed to fetch comments: ${error.message}`);
    }

    return res.status(200).json({
      success: true,
      data: comments || []
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
      // Get admin user ID (assuming there's only one admin or we want to notify all admins)
      const adminUsers = await supabaseRls.select("users", "id", { role: 'admin' });
      
      if (adminUsers && adminUsers.length > 0) {
        // Send notification to all admin users
        for (const admin of adminUsers) {
          const adminData = admin as any;
          await createNotification(
            adminData.id,
            "New Comment",
            `${userData.name || userData.username} commented on post: "${comment.trim()}"`,
            'comment',
            Number(post_id),
            newComment[0]?.id,
            userId
          );
        }
      }
    } catch (notificationError) {
      console.error('Error creating notification:', notificationError);
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
