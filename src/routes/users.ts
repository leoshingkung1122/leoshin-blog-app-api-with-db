import { Router } from 'express';
import { getSupabaseAdmin } from '../utils/supabase';
import protectAdmin from '../middleware/protectAdmin';

const router = Router();

// ดูรายการผู้ใช้ทั้งหมด
router.get('/', protectAdmin, async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id,
        username,
        name,
        profile_pic,
        role,
        status,
        updated_at,
        introduction
      `)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// ดูรายละเอียดผู้ใช้พร้อมกิจกรรม
router.get('/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseAdmin();

    // ข้อมูลผู้ใช้
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        username,
        name,
        profile_pic,
        role,
        status,
        updated_at,
        introduction
      `)
      .eq('id', id)
      .single();

    if (userError) throw userError;

    // ข้อมูล comments ของผู้ใช้
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        id,
        comment,
        created_at,
        post_id,
        blog_posts!inner(title)
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    if (commentsError) throw commentsError;

    // ข้อมูล likes ของผู้ใช้
    const { data: likes, error: likesError } = await supabase
      .from('post_likes')
      .select(`
        id,
        created_at,
        post_id,
        blog_posts!inner(title)
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    if (likesError) throw likesError;

    res.json({
      success: true,
      data: {
        user,
        comments,
        likes
      }
    });
  } catch (error) {
    next(error);
  }
});

// อัปเดตสถานะผู้ใช้ (ban/unban)
router.patch('/:id/status', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'ban'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Status must be either "active" or "ban"'
      });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `User ${status === 'ban' ? 'banned' : 'unbanned'} successfully`,
      data
    });
  } catch (error) {
    next(error);
  }
});

// ลบผู้ใช้
router.delete('/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseAdmin();

    // ลบ comments ของผู้ใช้ก่อน
    await supabase
      .from('comments')
      .delete()
      .eq('user_id', id);

    // ลบ likes ของผู้ใช้
    await supabase
      .from('post_likes')
      .delete()
      .eq('user_id', id);

    // ลบผู้ใช้
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// ลบ comment ของผู้ใช้
router.delete('/:userId/comments/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;