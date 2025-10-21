import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWithAuth, getSupabaseAdmin } from "./supabase";

/**
 * Helper class สำหรับทำ database operations ผ่าน Supabase Client
 * เพื่อให้ RLS policies ทำงานได้ถูกต้อง
 */
export class SupabaseRlsHelper {
  public supabase: SupabaseClient;

  constructor(accessTokenOrClient: string | SupabaseClient) {
    if (typeof accessTokenOrClient === 'string') {
      this.supabase = getSupabaseWithAuth(accessTokenOrClient);
    } else {
      this.supabase = accessTokenOrClient;
    }
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
    console.log(`🗑️ Attempting to delete from ${table} with filters:`, filters);
    
    let query = this.supabase.from(table);
    console.log(`🔍 Initial query type:`, typeof query);
    console.log(`🔍 Query has eq method:`, typeof (query as any).eq);

    // เพิ่ม filters
    Object.entries(filters).forEach(([key, value]) => {
      console.log(`🔧 Applying filter: ${key} = ${value}`);
      if (typeof (query as any).eq === 'function') {
        query = (query as any).eq(key, value);
        console.log(`✅ Filter applied successfully`);
      } else {
        console.error(`❌ query.eq is not a function! Type:`, typeof (query as any).eq);
        throw new Error(`query.eq is not a function. Query type: ${typeof query}`);
      }
    });

    console.log(`🔍 Final query before delete:`, typeof query);
    console.log(`🔍 Query has delete method:`, typeof (query as any).delete);

    // ทำ delete operation
    const { data: result, error } = await (query as any).delete().select();

    if (error) {
      console.error(`❌ Database delete failed for ${table}:`, error);
      throw new Error(`Database delete failed: ${error.message}`);
    }

    console.log(`✅ Successfully deleted from ${table}:`, result);
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
 * Factory function สำหรับสร้าง Admin SupabaseRlsHelper instance (bypass RLS)
 */
export function createSupabaseAdminHelper(): SupabaseRlsHelper {
  const supabase = getSupabaseAdmin();
  return new SupabaseRlsHelper(supabase);
}

/**
 * Middleware helper สำหรับดึง access token จาก request
 */
export function getAccessTokenFromRequest(req: any): string | undefined {
  return req.headers.authorization?.split(" ")[1];
}
