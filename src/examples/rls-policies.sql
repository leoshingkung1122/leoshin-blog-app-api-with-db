-- ตัวอย่าง RLS Policies สำหรับ Supabase
-- ไฟล์นี้แสดงตัวอย่างการสร้าง RLS policies ที่จะทำงานกับ auth.uid()

-- 1. เปิดใช้งาน RLS สำหรับตาราง users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 2. Policy สำหรับให้ผู้ใช้ดูข้อมูลของตัวเองเท่านั้น
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

-- 3. Policy สำหรับให้ผู้ใช้แก้ไขข้อมูลของตัวเองเท่านั้น
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- 4. Policy สำหรับให้ admin ดูข้อมูลผู้ใช้ทั้งหมด
CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 5. Policy สำหรับตาราง blog_posts (ปรับชื่อตามตารางจริง)
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- ให้ทุกคนดู posts ที่ status_id = 2 (published)
CREATE POLICY "Anyone can view published posts" ON blog_posts
    FOR SELECT USING (status_id = 2);

-- ให้ admin เท่านั้นที่สร้าง/แก้ไข/ลบ posts ได้
CREATE POLICY "Admins can manage posts" ON blog_posts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 6. Policy สำหรับตาราง comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- ให้ผู้ใช้ดู comments ของตัวเองเท่านั้น
CREATE POLICY "Users can view own comments" ON comments
    FOR SELECT USING (auth.uid() = user_id);

-- ให้ผู้ใช้สร้าง comments ได้
CREATE POLICY "Users can create comments" ON comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ให้ผู้ใช้แก้ไข comments ของตัวเองได้
CREATE POLICY "Users can update own comments" ON comments
    FOR UPDATE USING (auth.uid() = user_id);

-- ให้ผู้ใช้ลบ comments ของตัวเองได้
CREATE POLICY "Users can delete own comments" ON comments
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Policy สำหรับตาราง post_likes
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- ให้ผู้ใช้ดู likes ของตัวเองเท่านั้น
CREATE POLICY "Users can view own likes" ON post_likes
    FOR SELECT USING (auth.uid() = user_id);

-- ให้ผู้ใช้สร้าง likes ได้
CREATE POLICY "Users can create likes" ON post_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ให้ผู้ใช้ลบ likes ของตัวเองได้
CREATE POLICY "Users can delete own likes" ON post_likes
    FOR DELETE USING (auth.uid() = user_id);

-- 8. Policy สำหรับตาราง notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ให้ผู้ใช้ดู notifications ของตัวเองเท่านั้น
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- ให้ admin สร้าง notifications ได้
CREATE POLICY "Admins can create notifications" ON notifications
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ให้ผู้ใช้แก้ไข notifications ของตัวเองได้ (เช่น mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);
