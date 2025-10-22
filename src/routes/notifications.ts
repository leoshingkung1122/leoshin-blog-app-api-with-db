import { Router, Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DatabaseError, NotFoundError, ValidationError } from "../utils/errors";
import protectAdmin from "../middleware/protectAdmin";
import { getSupabaseAdmin } from "../utils/supabase";

const router = Router();

// GET /notifications - Get all notifications for admin
router.get("/", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const accessToken = (req as any).accessToken;
  const supabaseAdmin = getSupabaseAdmin();

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(100, limit));
  const offset = (safePage - 1) * safeLimit;

  try {
    // Get total count first
    const { count: totalCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true });

    // Get paginated notifications
    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select(`
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        created_at,
        related_post_id,
        related_comment_id,
        related_user_id,
        users:related_user_id (
          id,
          name,
          username,
          profile_pic
        ),
        blog_posts:related_post_id (
          id,
          title,
          slug
        ),
        comments:related_comment_id (
          id,
          comment,
          post_id,
          blog_posts:post_id (
            id,
            title,
            slug
          )
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + safeLimit - 1);

    if (error) {
      console.error('Error fetching notifications:', error);
      throw new DatabaseError('Failed to fetch notifications');
    }

    // Transform the data
    const transformedNotifications = notifications?.map((notification: any) => {
      const user = notification.users;
      const post = notification.blog_posts || notification.comments?.blog_posts;
      const comment = notification.comments;
      
      return {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        is_read: notification.is_read,
        created_at: notification.created_at,
        user: user ? {
          id: user.id,
          name: user.name || user.username,
          username: user.username,
          profile_pic: user.profile_pic
        } : null,
        post: post ? {
          id: post.id,
          title: post.title,
          slug: post.slug
        } : null,
        comment: comment ? {
          id: comment.id,
          content: comment.comment,
          post_id: comment.post_id
        } : null,
        time: formatTimeAgo(notification.created_at)
      };
    }) || [];

    const totalPages = Math.ceil((totalCount || 0) / safeLimit);

    res.json({
      success: true,
      data: transformedNotifications,
      pagination: {
        currentPage: safePage,
        totalPages: totalPages,
        totalNotifications: totalCount || 0,
        limit: safeLimit,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1
      }
    });

  } catch (error) {
    console.error('Error in notifications GET:', error);
    throw error;
  }
}));

// DELETE /notifications/:id - Delete a specific notification
router.delete("/:id", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const accessToken = (req as any).accessToken;
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Check if notification exists
    const { data: existingNotification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existingNotification) {
      throw new NotFoundError('Notification not found');
    }

    // Delete the notification
    const { error: deleteError } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting notification:', deleteError);
      throw new DatabaseError('Failed to delete notification');
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Error in notification DELETE:', error);
    throw error;
  }
}));

// PUT /notifications/:id/read - Mark notification as read
router.put("/:id/read", protectAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const accessToken = (req as any).accessToken;
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Update notification as read
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification as read:', error);
      throw new DatabaseError('Failed to mark notification as read');
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('Error in notification PUT:', error);
    throw error;
  }
}));

// Helper function to format time ago
function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

export default router;
