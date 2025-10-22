import { Router } from 'express';
import { getSupabaseAdmin } from '../utils/supabase';
import protectAdmin from '../middleware/protectAdmin';

const router = Router();

// ดูรายการผู้ใช้ทั้งหมด
router.get('/', protectAdmin, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const supabase = getSupabaseAdmin();
    
    // ดึงข้อมูลผู้ใช้พร้อม pagination
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
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // นับจำนวนผู้ใช้ทั้งหมด
    const { count, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const totalPages = Math.ceil((count || 0) / limit);

    res.json({ 
      success: true, 
      data: users,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count || 0,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// ดูรายละเอียดผู้ใช้พร้อมกิจกรรม
router.get('/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const commentsPage = parseInt(req.query.commentsPage as string) || 1;
    const likesPage = parseInt(req.query.likesPage as string) || 1;
    const commentsLimit = parseInt(req.query.commentsLimit as string) || 5;
    const likesLimit = parseInt(req.query.likesLimit as string) || 5;
    
    const commentsOffset = (commentsPage - 1) * commentsLimit;
    const likesOffset = (likesPage - 1) * likesLimit;

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

    // ข้อมูล comments ของผู้ใช้พร้อม pagination
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
      .order('created_at', { ascending: false })
      .range(commentsOffset, commentsOffset + commentsLimit - 1);

    if (commentsError) throw commentsError;

    // นับจำนวน comments ทั้งหมด
    const { count: commentsCount, error: commentsCountError } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    if (commentsCountError) throw commentsCountError;

    // ข้อมูล likes ของผู้ใช้พร้อม pagination
    const { data: likes, error: likesError } = await supabase
      .from('post_likes')
      .select(`
        id,
        created_at,
        post_id,
        blog_posts!inner(title)
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .range(likesOffset, likesOffset + likesLimit - 1);

    if (likesError) throw likesError;

    // นับจำนวน likes ทั้งหมด
    const { count: likesCount, error: likesCountError } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    if (likesCountError) throw likesCountError;

    const commentsTotalPages = Math.ceil((commentsCount || 0) / commentsLimit);
    const likesTotalPages = Math.ceil((likesCount || 0) / likesLimit);

    res.json({ 
      success: true, 
      data: { 
        user, 
        comments, 
        likes,
        pagination: {
          comments: {
            currentPage: commentsPage,
            totalPages: commentsTotalPages,
            totalItems: commentsCount || 0,
            itemsPerPage: commentsLimit,
            hasNextPage: commentsPage < commentsTotalPages,
            hasPrevPage: commentsPage > 1
          },
          likes: {
            currentPage: likesPage,
            totalPages: likesTotalPages,
            totalItems: likesCount || 0,
            itemsPerPage: likesLimit,
            hasNextPage: likesPage < likesTotalPages,
            hasPrevPage: likesPage > 1
          }
        }
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