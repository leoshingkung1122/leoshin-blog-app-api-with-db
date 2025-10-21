# Environment Variables สำหรับการอัปโหลดรูปภาพ

## Environment Variables ที่จำเป็น

### 1. Supabase Configuration
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

**วิธีการหา:**
1. เข้าไปที่ [Supabase Dashboard](https://supabase.com/dashboard)
2. เลือกโปรเจคของคุณ
3. ไปที่ **Settings** > **API**
4. คัดลอก:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`

### 2. Server Configuration
```bash
PORT=4001
NODE_ENV=production
```

## Supabase Storage Setup

### 1. สร้าง Bucket
1. เข้าไปที่ **Storage** ใน Supabase Dashboard
2. สร้าง bucket ใหม่ชื่อ `post-images`
3. ตั้งค่าเป็น **Public bucket**

### 2. ตั้งค่า RLS Policies
สร้าง policies สำหรับ bucket `post-images`:

```sql
-- Policy สำหรับการอัปโหลดไฟล์ (เฉพาะ admin)
CREATE POLICY "Admin can upload files" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'post-images' AND
  auth.role() = 'authenticated'
);

-- Policy สำหรับการอ่านไฟล์ (ทุกคน)
CREATE POLICY "Anyone can view files" ON storage.objects
FOR SELECT USING (bucket_id = 'post-images');
```

## การตั้งค่าใน Vercel

1. เข้าไปที่ Vercel Dashboard
2. เลือกโปรเจค `leoshin-blog-app-api-with-db`
3. ไปที่ **Settings** > **Environment Variables**
4. เพิ่ม variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `NODE_ENV` = `production`

## การทดสอบ

หลังจากตั้งค่าแล้ว ให้ทดสอบการอัปโหลดรูปภาพใน Admin Panel:
1. เข้าไปที่ Admin Panel
2. สร้างหรือแก้ไขบทความ
3. อัปโหลดรูปภาพ
4. ตรวจสอบว่าไม่มี error
