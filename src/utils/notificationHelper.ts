import { getSupabase } from "./supabase";

// Helper function to create notification
export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: 'comment' | 'like' | 'post',
  relatedPostId?: number,
  relatedCommentId?: number,
  relatedUserId?: string
) {
  const supabase = getSupabase();
  
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message,
        type,
        is_read: false,
        related_post_id: relatedPostId || null,
        related_comment_id: relatedCommentId || null,
        related_user_id: relatedUserId || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createNotification:', error);
    return null;
  }
}

// Helper function to get post author ID
export async function getPostAuthorId(postId: number): Promise<string | null> {
  const supabase = getSupabase();
  
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('author_id')
      .eq('id', postId)
      .single();

    if (error || !data) {
      console.error('Error fetching post author:', error);
      return null;
    }

    return data.author_id;
  } catch (error) {
    console.error('Error in getPostAuthorId:', error);
    return null;
  }
}
