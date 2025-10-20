import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWithAuth } from "./supabase";

/**
 * Helper class สำหรับทำ database operations ผ่าน Supabase Client
 * เพื่อให้ RLS policies ทำงานได้ถูกต้อง
 */
export class SupabaseRlsHelper {
  private supabase: SupabaseClient;

  constructor(accessToken: string) {
    this.supabase = getSupabaseWithAuth(accessToken);
  }

  /**
   * ทำ SELECT query ผ่าน Supabase Client
   */
  async select(
    table: string, 
    columns: string = "*", 
    filters?: Record<string, any>,
    options?: {
      orderBy?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    let query = this.supabase.from(table).select(columns);

    // เพิ่ม filters
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === 'string' && value.includes('%')) {
          query = query.ilike(key, value);
        } else {
          query = query.eq(key, value);
        }
      });
    }

    // เพิ่ม ordering
    if (options?.orderBy) {
      const [column, direction] = options.orderBy.split(':');
      query = query.order(column, { ascending: direction !== 'desc' });
    }

    // เพิ่ม pagination
    if (options?.limit) {
      query = query.limit(options.limit);
      if (options?.offset) {
        query = query.range(options.offset, options.offset + options.limit - 1);
      }
    }

    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return data;
  }

  /**
   * ทำ INSERT query ผ่าน Supabase Client
   */
  async insert(table: string, data: Record<string, any>) {
    const { data: result, error } = await this.supabase
      .from(table)
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`Database insert failed: ${error.message}`);
    }

    return result;
  }

  /**
   * ทำ UPDATE query ผ่าน Supabase Client
   */
  async update(
    table: string, 
    data: Record<string, any>, 
    filters: Record<string, any>
  ) {
    let query = this.supabase.from(table).update(data);

    // เพิ่ม filters
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data: result, error } = await query.select().single();

    if (error) {
      throw new Error(`Database update failed: ${error.message}`);
    }

    return result;
  }

  /**
   * ทำ DELETE query ผ่าน Supabase Client
   */
  async delete(table: string, filters: Record<string, any>) {
    // ใช้วิธีง่ายๆ โดยสร้าง query string
    const filterEntries = Object.entries(filters);
    let query = this.supabase.from(table);

    // เพิ่ม filters
    filterEntries.forEach(([key, value]) => {
      (query as any).eq(key, value);
    });

    // ทำ delete operation
    const { data: result, error } = await query.delete().select();

    if (error) {
      throw new Error(`Database delete failed: ${error.message}`);
    }

    return result && result.length > 0 ? result[0] : null;
  }

  /**
   * ทำ raw SQL query ผ่าน rpc function
   */
  async rpc(functionName: string, params?: Record<string, any>) {
    const { data, error } = await this.supabase.rpc(functionName, params);

    if (error) {
      throw new Error(`RPC call failed: ${error.message}`);
    }

    return data;
  }

  /**
   * ดึงข้อมูลผู้ใช้ปัจจุบันจาก auth.uid()
   */
  async getCurrentUser() {
    const { data: { user }, error } = await this.supabase.auth.getUser();

    if (error) {
      throw new Error(`Failed to get current user: ${error.message}`);
    }

    return user;
  }
}

/**
 * Factory function สำหรับสร้าง SupabaseRlsHelper instance
 */
export function createSupabaseRlsHelper(accessToken: string): SupabaseRlsHelper {
  return new SupabaseRlsHelper(accessToken);
}

/**
 * Middleware helper สำหรับดึง access token จาก request
 */
export function getAccessTokenFromRequest(req: any): string | undefined {
  return req.headers.authorization?.split(" ")[1];
}
