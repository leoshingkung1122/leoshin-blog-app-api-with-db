import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectUser from "../middleware/protectUser";
import { createSupabaseRlsHelper } from "../utils/supabaseRls";
import { getSupabase } from "../utils/supabase";
import { createNotification, getPostAuthorId } from "../utils/notificationHelper";

const router = Router();

// POST /likes/:postId - Toggle like for a post
router.post("/:postId", protectUser, asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  const accessToken = (req as any).accessToken;
  const userId = (req as any).user?.id;

  // Validate postId parameter
  if (!postId || isNaN(Number(postId))) {
    throw new ValidationError("Invalid post ID");
  }

  if (!userId) {
    throw new ValidationError("User authentication required");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Check if post exists
    const post = await supabaseRls.select("blog_posts", "id, likes", { id: postId });
    if (!post || post.length === 0) {
      throw new NotFoundError("Post", postId);
    }

    const currentPost = post[0] as any;
    const currentLikeCount = currentPost.likes || 0;

    // Check if user already liked this post
    const existingLike = await supabaseRls.select("post_likes", "id", { 
      post_id: Number(postId), 
      user_id: userId 
    });

    let isLiked = false;
    let newLikeCount = 0;

    if (existingLike && existingLike.length > 0) {
      // User already liked, remove the like
      await supabaseRls.delete("post_likes", { 
        post_id: Number(postId), 
        user_id: userId 
      });

      // Decrement likes count in blog_posts
      newLikeCount = Math.max(currentLikeCount - 1, 0);
      await supabaseRls.update("blog_posts", {
        likes: newLikeCount
      }, { id: postId });

      isLiked = false;
    } else {
      // User hasn't liked yet, add the like
      await supabaseRls.insert("post_likes", {
        post_id: Number(postId),
        user_id: userId
      });

      // Increment likes count in blog_posts
      newLikeCount = currentLikeCount + 1;
      await supabaseRls.update("blog_posts", {
        likes: newLikeCount
      }, { id: postId });

      isLiked = true;

      // Create notification for admin when someone likes a post
      try {
        // Get admin user ID (assuming there's only one admin or we want to notify all admins)
        const adminUsers = await supabaseRls.select("users", "id", { role: 'admin' });
        
        if (adminUsers && adminUsers.length > 0) {
          // Get user info for the notification
          const user = await supabaseRls.select("users", "name, username", { id: userId });
          const userData = user && user.length > 0 ? user[0] as any : null;
          
          if (userData) {
            // Send notification to all admin users
            for (const admin of adminUsers) {
              const adminData = admin as any;
              await createNotification(
                adminData.id,
                "New Like",
                `${userData.name || userData.username} liked a post`,
                'like',
                Number(postId),
                undefined,
                userId
              );
            }
          }
        }
      } catch (notificationError) {
        console.error('Error creating like notification:', notificationError);
        // Don't fail the like operation if notification fails
      }
    }

    return res.status(200).json({
      success: true,
      message: isLiked ? "Post liked successfully" : "Post unliked successfully",
      data: {
        isLiked,
        likeCount: newLikeCount
      }
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    console.error("Error toggling like:", error);
    throw new DatabaseError("Failed to toggle like");
  }
}));

// GET /likes/:postId - Get like status for a post
router.get("/:postId", protectUser, asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId;
  const accessToken = (req as any).accessToken;
  const userId = (req as any).user?.id;

  // Validate postId parameter
  if (!postId || isNaN(Number(postId))) {
    throw new ValidationError("Invalid post ID");
  }

  if (!userId) {
    throw new ValidationError("User authentication required");
  }

  const supabaseRls = createSupabaseRlsHelper(accessToken);

  try {
    // Check if user liked this post
    const userLike = await supabaseRls.select("post_likes", "id", { 
      post_id: Number(postId), 
      user_id: userId 
    });

    // Get total like count
    const totalLikes = await supabaseRls.select("post_likes", "id", { 
      post_id: Number(postId) 
    });

    const isLiked = userLike && userLike.length > 0;
    const likeCount = totalLikes ? totalLikes.length : 0;

    return res.status(200).json({
      success: true,
      data: {
        isLiked,
        likeCount
      }
    });
  } catch (error) {
    console.error("Error getting like status:", error);
    throw new DatabaseError("Failed to get like status");
  }
}));

// GET /likes/:postId/public - Get public like count (no authentication required)
router.get("/:postId/public", asyncHandler(async (req: Request, res: Response) => {
  const postId = req.params.postId;

  // Validate postId parameter
  if (!postId || isNaN(Number(postId))) {
    throw new ValidationError("Invalid post ID");
  }

  // Use public Supabase client for getting like count (no authentication required)
  const supabase = getSupabase();

  try {
    // Get total like count
    const { data: totalLikes, error } = await supabase
      .from("post_likes")
      .select("id")
      .eq("post_id", Number(postId));

    if (error) {
      console.error("Supabase error:", error);
      throw new DatabaseError(`Failed to get like count: ${error.message}`);
    }

    const likeCount = totalLikes ? totalLikes.length : 0;

    return res.status(200).json({
      success: true,
      data: {
        likeCount
      }
    });
  } catch (error) {
    console.error("Error getting public like count:", error);
    throw new DatabaseError("Failed to get like count");
  }
}));

export default router;
