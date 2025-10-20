# Supabase RLS Integration Guide

## ภาพรวม
โปรเจคนี้ได้รับการปรับปรุงให้รองรับ Supabase Row Level Security (RLS) โดยการส่ง JWT token ไปกับ database queries เพื่อให้ `auth.uid()` ทำงานได้ถูกต้อง

## การเปลี่ยนแปลงหลัก

### 1. การตั้งค่า Supabase Client
- **ไฟล์**: `src/utils/supabase.ts`
- **เพิ่ม**: `getSupabaseWithAuth(token)` function
- **วัตถุประสงค์**: สร้าง Supabase client ที่มี Authorization header

```typescript
// สร้าง client ที่มี auth context
const supabase = getSupabaseWithAuth(accessToken);
```

### 2. Supabase RLS Helper
- **ไฟล์**: `src/utils/supabaseRls.ts`
- **วัตถุประสงค์**: Helper class สำหรับทำ database operations ผ่าน Supabase Client
- **คุณสมบัติ**:
  - `select()` - SELECT queries
  - `insert()` - INSERT operations
  - `update()` - UPDATE operations
  - `delete()` - DELETE operations
  - `rpc()` - Raw SQL ผ่าน RPC functions

### 3. อัปเดต Middleware
- **ไฟล์**: `src/middleware/protectUser.ts`, `src/middleware/protectAdmin.ts`
- **การเปลี่ยนแปลง**: ใช้ `getSupabaseWithAuth()` แทน `getSupabase()`
- **ผลลัพธ์**: JWT token จะถูกส่งไปกับทุก database query

### 4. ตัวอย่าง Routes
- **ไฟล์**: `src/routes/posts-with-rls.ts`, `src/routes/comments-with-rls.ts`, `src/routes/likes-with-rls.ts`
- **การใช้งาน**: ใช้ `createSupabaseRlsHelper()` สำหรับ database operations

## การใช้งาน

### Frontend (ส่ง Token)
```javascript
// ดึง token จาก Supabase session
const { data, error } = await supabase.auth.getSession();
const token = data.session?.access_token;

// ส่ง token ไปกับ API request
await fetch("/api/posts", {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
```

### Backend (รับ Token)
```typescript
// ใน middleware หรือ route handler
const token = req.headers.authorization?.split(" ")[1];
const supabaseRls = createSupabaseRlsHelper(token);

// ใช้สำหรับ database operations
const posts = await supabaseRls.select("blog_posts", "*", { status_id: 2 });
```

## RLS Policies

### ตัวอย่าง Policies
ไฟล์ `src/examples/rls-policies.sql` มีตัวอย่าง RLS policies สำหรับ:
- `users` table
- `blog_posts` table
- `comments` table
- `post_likes` table
- `notifications` table

### การเปิดใช้งาน RLS
```sql
-- เปิดใช้งาน RLS สำหรับตาราง
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- สร้าง policy
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);
```

## ข้อดีของการปรับปรุง

1. **ความปลอดภัย**: RLS policies จะทำงานได้ถูกต้อง
2. **การควบคุมสิทธิ์**: `auth.uid()` จะ return user ID ที่ถูกต้อง
3. **การแยกข้อมูล**: ผู้ใช้จะเห็นเฉพาะข้อมูลของตัวเอง
4. **ความยืดหยุ่น**: สามารถใช้ Supabase Client หรือ RLS Helper ได้ตามต้องการ

## การทดสอบ

### 1. ทดสอบ Auth Context
```typescript
// ทดสอบว่า auth.uid() ทำงานได้
const supabaseRls = createSupabaseRlsHelper(token);
const currentUser = await supabaseRls.getCurrentUser();
console.log(currentUser.id); // ควรได้ user ID
```

### 2. ทดสอบ RLS Policies
```typescript
// ทดสอบว่า RLS policies ทำงาน
const users = await supabaseRls.select("users", "*");
// ควรได้เฉพาะข้อมูลของผู้ใช้ที่ login
```

## หมายเหตุสำคัญ

1. **Public Routes**: สำหรับ routes ที่ไม่ต้องการ authentication ให้ใช้ `getSupabase()` ธรรมดา
2. **Authenticated Routes**: สำหรับ routes ที่ต้องการ authentication ให้ใช้ `getSupabaseWithAuth(token)`
3. **RLS Policies**: ต้องสร้าง policies ใน Supabase Dashboard หรือใช้ไฟล์ SQL ที่ให้มา
4. **Token Management**: Frontend ต้องส่ง token ไปกับทุก API request ที่ต้องการ authentication

## การแก้ไขปัญหา

### ปัญหา: auth.uid() return null
**สาเหตุ**: ไม่ได้ส่ง JWT token ไปกับ database query
**วิธีแก้**: ใช้ `getSupabaseWithAuth(token)` แทน `getSupabase()`

### ปัญหา: RLS policies ไม่ทำงาน
**สาเหตุ**: ไม่ได้เปิดใช้งาน RLS หรือไม่ได้สร้าง policies
**วิธีแก้**: เปิดใช้งาน RLS และสร้าง policies ตามตัวอย่าง

### ปัญหา: 403 Forbidden
**สาเหตุ**: RLS policies block การเข้าถึงข้อมูล
**วิธีแก้**: ตรวจสอบ policies และ user permissions
