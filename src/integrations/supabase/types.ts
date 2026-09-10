export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          processed_at: string | null
          reason: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          processed_at?: string | null
          reason?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          processed_at?: string | null
          reason?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string | null
          created_at: string
          full_name: string
          id: string
          is_default: boolean | null
          label: string | null
          phone: string
          postal_code: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone: string
          postal_code: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone?: string
          postal_code?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      advertisements: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_text: string | null
          link_url: string | null
          placement: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_text?: string | null
          link_url?: string | null
          placement?: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_text?: string | null
          link_url?: string | null
          placement?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          badge_text: string | null
          created_at: string
          cta_link: string | null
          cta_text: string | null
          display_order: number | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          location: string | null
          starts_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location?: string | null
          starts_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location?: string | null
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
          user_id: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          exchange_enabled: boolean | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          parent_id: string | null
          return_enabled: boolean | null
          return_window_days: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          exchange_enabled?: boolean | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          return_enabled?: boolean | null
          return_window_days?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          exchange_enabled?: boolean | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          return_enabled?: boolean | null
          return_window_days?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          audience: string
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          first_order_only: boolean
          id: string
          is_active: boolean | null
          max_discount_amount: number | null
          min_order_amount: number | null
          updated_at: string
          usage_count: number | null
          usage_limit: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          audience?: string
          code: string
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          first_order_only?: boolean
          id?: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          min_order_amount?: number | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          audience?: string
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          first_order_only?: boolean
          id?: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          min_order_amount?: number | null
          updated_at?: string
          usage_count?: number | null
          usage_limit?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      delivery_partners: {
        Row: {
          created_at: string
          current_location: Json | null
          id: string
          is_available: boolean | null
          updated_at: string
          user_id: string
          vehicle_number: string | null
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string
          current_location?: Json | null
          id?: string
          is_available?: boolean | null
          updated_at?: string
          user_id: string
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string
          current_location?: Json | null
          id?: string
          is_available?: boolean | null
          updated_at?: string
          user_id?: string
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Relationships: []
      }
      delivery_time_slots: {
        Row: {
          created_at: string
          display_order: number | null
          end_time: string
          id: string
          is_active: boolean | null
          max_orders_per_slot: number | null
          name: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          end_time: string
          id?: string
          is_active?: boolean | null
          max_orders_per_slot?: number | null
          name: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          end_time?: string
          id?: string
          is_active?: boolean | null
          max_orders_per_slot?: number | null
          name?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      founder_payment_logs: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          order_id: string | null
          payment_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          billing_address: Json
          cgst_amount: number
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          gst_amount: number
          id: string
          igst_amount: number
          invoice_number: string
          invoice_type: string
          issued_at: string
          items: Json
          legacy_invoice_number: string | null
          order_id: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          registration_payment_id: string | null
          sgst_amount: number
          shipping_amount: number
          taxable_amount: number
          total_amount: number
          user_id: string
          wallet_amount: number
        }
        Insert: {
          billing_address?: Json
          cgst_amount?: number
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          discount_amount?: number
          gst_amount?: number
          id?: string
          igst_amount?: number
          invoice_number: string
          invoice_type: string
          issued_at?: string
          items?: Json
          legacy_invoice_number?: string | null
          order_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status: string
          registration_payment_id?: string | null
          sgst_amount?: number
          shipping_amount?: number
          taxable_amount: number
          total_amount: number
          user_id: string
          wallet_amount?: number
        }
        Update: {
          billing_address?: Json
          cgst_amount?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          gst_amount?: number
          id?: string
          igst_amount?: number
          invoice_number?: string
          invoice_type?: string
          issued_at?: string
          items?: Json
          legacy_invoice_number?: string | null
          order_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          registration_payment_id?: string | null
          sgst_amount?: number
          shipping_amount?: number
          taxable_amount?: number
          total_amount?: number
          user_id?: string
          wallet_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_registration_payment_id_fkey"
            columns: ["registration_payment_id"]
            isOneToOne: true
            referencedRelation: "founder_payment_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      mlm_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      mlm_settings_versions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          note: string | null
          settings: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          note?: string | null
          settings: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          note?: string | null
          settings?: Json
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_assignments: {
        Row: {
          assigned_at: string
          created_at: string
          delivered_at: string | null
          delivery_partner_id: string
          delivery_photo_url: string | null
          id: string
          is_return_assignment: boolean | null
          notes: string | null
          order_id: string
          original_assignment_id: string | null
          picked_up_at: string | null
          pickup_photo_url: string | null
          status: string
          undelivery_reason:
            | Database["public"]["Enums"]["undelivery_reason"]
            | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          delivered_at?: string | null
          delivery_partner_id: string
          delivery_photo_url?: string | null
          id?: string
          is_return_assignment?: boolean | null
          notes?: string | null
          order_id: string
          original_assignment_id?: string | null
          picked_up_at?: string | null
          pickup_photo_url?: string | null
          status?: string
          undelivery_reason?:
            | Database["public"]["Enums"]["undelivery_reason"]
            | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          created_at?: string
          delivered_at?: string | null
          delivery_partner_id?: string
          delivery_photo_url?: string | null
          id?: string
          is_return_assignment?: boolean | null
          notes?: string | null
          order_id?: string
          original_assignment_id?: string | null
          picked_up_at?: string | null
          pickup_photo_url?: string | null
          status?: string
          undelivery_reason?:
            | Database["public"]["Enums"]["undelivery_reason"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_assignments_delivery_partner_id_fkey"
            columns: ["delivery_partner_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignments_original_assignment_id_fkey"
            columns: ["original_assignment_id"]
            isOneToOne: false
            referencedRelation: "order_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          product_price: number
          quantity: number
          total_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          product_price: number
          quantity: number
          total_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_price?: number
          quantity?: number
          total_price?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          changed_by_type: string
          created_at: string
          delivery_partner_id: string | null
          id: string
          metadata: Json | null
          new_status: Database["public"]["Enums"]["order_status"]
          notes: string | null
          order_id: string
          previous_status: Database["public"]["Enums"]["order_status"] | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_type?: string
          created_at?: string
          delivery_partner_id?: string | null
          id?: string
          metadata?: Json | null
          new_status: Database["public"]["Enums"]["order_status"]
          notes?: string | null
          order_id: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Update: {
          changed_by?: string | null
          changed_by_type?: string
          created_at?: string
          delivery_partner_id?: string | null
          id?: string
          metadata?: Json | null
          new_status?: Database["public"]["Enums"]["order_status"]
          notes?: string | null
          order_id?: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_delivery_partner_id_fkey"
            columns: ["delivery_partner_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_deleted_at: string | null
          cod_amount: number | null
          cod_collected: boolean | null
          cod_collected_at: string | null
          cod_settled: boolean | null
          cod_settled_at: string | null
          confirmation_email_sent_at: string | null
          coupon_code: string | null
          created_at: string
          discount_amount: number | null
          fulfillment_type: string
          id: string
          idempotency_key: string | null
          is_cod: boolean | null
          notes: string | null
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          pickup_store_id: string | null
          preferred_delivery_date: string | null
          preferred_delivery_slot_id: string | null
          purchase_commission_credited: boolean
          sales_counted_at: string | null
          shipping_address: Json
          shipping_amount: number | null
          status: Database["public"]["Enums"]["order_status"]
          stock_committed_at: string | null
          stock_restored_at: string | null
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string
          wallet_amount_used: number | null
        }
        Insert: {
          admin_deleted_at?: string | null
          cod_amount?: number | null
          cod_collected?: boolean | null
          cod_collected_at?: string | null
          cod_settled?: boolean | null
          cod_settled_at?: string | null
          confirmation_email_sent_at?: string | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          fulfillment_type?: string
          id?: string
          idempotency_key?: string | null
          is_cod?: boolean | null
          notes?: string | null
          order_number: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_store_id?: string | null
          preferred_delivery_date?: string | null
          preferred_delivery_slot_id?: string | null
          purchase_commission_credited?: boolean
          sales_counted_at?: string | null
          shipping_address: Json
          shipping_amount?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          stock_committed_at?: string | null
          stock_restored_at?: string | null
          subtotal: number
          total_amount: number
          updated_at?: string
          user_id: string
          wallet_amount_used?: number | null
        }
        Update: {
          admin_deleted_at?: string | null
          cod_amount?: number | null
          cod_collected?: boolean | null
          cod_collected_at?: string | null
          cod_settled?: boolean | null
          cod_settled_at?: string | null
          confirmation_email_sent_at?: string | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          fulfillment_type?: string
          id?: string
          idempotency_key?: string | null
          is_cod?: boolean | null
          notes?: string | null
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_store_id?: string | null
          preferred_delivery_date?: string | null
          preferred_delivery_slot_id?: string | null
          purchase_commission_credited?: boolean
          sales_counted_at?: string | null
          shipping_address?: Json
          shipping_amount?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          stock_committed_at?: string | null
          stock_restored_at?: string | null
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
          wallet_amount_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_pickup_store_id_fkey"
            columns: ["pickup_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_preferred_delivery_slot_id_fkey"
            columns: ["preferred_delivery_slot_id"]
            isOneToOne: false
            referencedRelation: "delivery_time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_send_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          outcome: string
          phone: string
          provider_request_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          outcome: string
          phone: string
          provider_request_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          outcome?: string
          phone?: string
          provider_request_id?: string | null
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount: number
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number
          guest_details: Json | null
          id: string
          items: Json
          notes: string | null
          order_id: string | null
          payment_id: string
          purpose: string
          razorpay_order_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          guest_details?: Json | null
          id?: string
          items?: Json
          notes?: string | null
          order_id?: string | null
          payment_id: string
          purpose?: string
          razorpay_order_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          guest_details?: Json | null
          id?: string
          items?: Json
          notes?: string | null
          order_id?: string | null
          payment_id?: string
          purpose?: string
          razorpay_order_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_batch_check_log: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      product_display_settings: {
        Row: {
          created_at: string
          display_order: number
          is_enabled: boolean
          new_arrival_days: number | null
          product_limit: number
          section_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          is_enabled?: boolean
          new_arrival_days?: number | null
          product_limit?: number
          section_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          is_enabled?: boolean
          new_arrival_days?: number | null
          product_limit?: number
          section_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          created_at: string
          id: string
          is_verified_purchase: boolean | null
          product_id: string
          rating: number
          review_text: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_verified_purchase?: boolean | null
          product_id: string
          rating: number
          review_text?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_verified_purchase?: boolean | null
          product_id?: string
          rating?: number
          review_text?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          member_price: number | null
          price: number
          product_id: string
          sku: string | null
          stock_quantity: number
          unit_type: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          member_price?: number | null
          price: number
          product_id: string
          sku?: string | null
          stock_quantity?: number
          unit_type?: string
          unit_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          member_price?: number | null
          price?: number
          product_id?: string
          sku?: string | null
          stock_quantity?: number
          unit_type?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          gst_inclusive: boolean | null
          gst_percentage: number | null
          hsn_code: string | null
          id: string
          images: string[] | null
          is_active: boolean | null
          is_fast_selling: boolean
          is_featured: boolean | null
          member_price: number | null
          name: string
          price: number
          sales_count: number
          short_description: string | null
          sku: string | null
          slug: string
          stock_quantity: number
          unit_type: string | null
          unit_value: number | null
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          gst_inclusive?: boolean | null
          gst_percentage?: number | null
          hsn_code?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          is_fast_selling?: boolean
          is_featured?: boolean | null
          member_price?: number | null
          name: string
          price: number
          sales_count?: number
          short_description?: string | null
          sku?: string | null
          slug: string
          stock_quantity?: number
          unit_type?: string | null
          unit_value?: number | null
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          gst_inclusive?: boolean | null
          gst_percentage?: number | null
          hsn_code?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          is_fast_selling?: boolean
          is_featured?: boolean | null
          member_price?: number | null
          name?: string
          price?: number
          sales_count?: number
          short_description?: string | null
          sku?: string | null
          slug?: string
          stock_quantity?: number
          unit_type?: string | null
          unit_value?: number | null
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_agreement_at: string | null
          avatar_url: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          created_at: string
          email: string
          founder_status: string
          full_name: string | null
          id: string
          is_active: boolean | null
          is_designated_founder: boolean | null
          mlm_settings_version_id: string | null
          phone: string | null
          referral_count: number | null
          referred_by: string | null
          registration_fee_paid: number | null
          updated_at: string
          user_level: Database["public"]["Enums"]["user_level"] | null
        }
        Insert: {
          accepted_agreement_at?: string | null
          avatar_url?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          email: string
          founder_status?: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          is_designated_founder?: boolean | null
          mlm_settings_version_id?: string | null
          phone?: string | null
          referral_count?: number | null
          referred_by?: string | null
          registration_fee_paid?: number | null
          updated_at?: string
          user_level?: Database["public"]["Enums"]["user_level"] | null
        }
        Update: {
          accepted_agreement_at?: string | null
          avatar_url?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          email?: string
          founder_status?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          is_designated_founder?: boolean | null
          mlm_settings_version_id?: string | null
          phone?: string | null
          referral_count?: number | null
          referred_by?: string | null
          registration_fee_paid?: number | null
          updated_at?: string
          user_level?: Database["public"]["Enums"]["user_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "user_hierarchy"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean | null
          max_uses: number | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          incentive_amount: number | null
          incentive_paid: boolean | null
          referral_code_id: string | null
          referred_id: string
          referrer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          incentive_amount?: number | null
          incentive_paid?: boolean | null
          referral_code_id?: string | null
          referred_id: string
          referrer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          incentive_amount?: number | null
          incentive_paid?: boolean | null
          referral_code_id?: string | null
          referred_id?: string
          referrer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          order_id: string
          order_item_id: string
          picked_up_at: string | null
          pickup_address: Json | null
          pickup_date: string | null
          pickup_slot_id: string | null
          processed_at: string | null
          processed_by: string | null
          quantity: number
          reason: string
          refund_amount: number | null
          request_type: string
          resolution_type: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          order_id: string
          order_item_id: string
          picked_up_at?: string | null
          pickup_address?: Json | null
          pickup_date?: string | null
          pickup_slot_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          quantity?: number
          reason: string
          refund_amount?: number | null
          request_type: string
          resolution_type?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          picked_up_at?: string | null
          pickup_address?: Json | null
          pickup_date?: string | null
          pickup_slot_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          quantity?: number
          reason?: string
          refund_amount?: number | null
          request_type?: string
          resolution_type?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_pickup_slot_id_fkey"
            columns: ["pickup_slot_id"]
            isOneToOne: false
            referencedRelation: "delivery_time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      site_policies: {
        Row: {
          content: string
          id: string
          is_active: boolean | null
          policy_type: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          content?: string
          id?: string
          is_active?: boolean | null
          policy_type: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          is_active?: boolean | null
          policy_type?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      store_inventory: {
        Row: {
          id: string
          product_id: string
          stock_quantity: number | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          product_id: string
          stock_quantity?: number | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          stock_quantity?: number | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_staff: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_staff_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          closing_time: string | null
          created_at: string | null
          display_order: number | null
          email: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          manager_name: string | null
          manager_phone: string | null
          name: string
          opening_time: string | null
          phone: string | null
          postal_code: string
          slug: string
          state: string
          updated_at: string | null
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          closing_time?: string | null
          created_at?: string | null
          display_order?: number | null
          email?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name: string
          opening_time?: string | null
          phone?: string | null
          postal_code: string
          slug: string
          state: string
          updated_at?: string | null
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          closing_time?: string | null
          created_at?: string | null
          display_order?: number | null
          email?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name?: string
          opening_time?: string | null
          phone?: string | null
          postal_code?: string
          slug?: string
          state?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          id: string
          is_approved: boolean | null
          is_featured: boolean | null
          product_id: string | null
          rating: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          is_featured?: boolean | null
          product_id?: string | null
          rating?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          id?: string
          is_approved?: boolean | null
          is_featured?: boolean | null
          product_id?: string | null
          rating?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      undelivery_logs: {
        Row: {
          attempt_number: number
          created_at: string
          delivery_partner_id: string
          id: string
          order_assignment_id: string
          order_id: string
          reason: Database["public"]["Enums"]["undelivery_reason"]
          reason_notes: string | null
          return_completed_at: string | null
          return_initiated_at: string | null
          return_received_by: string | null
          undelivered_at: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          delivery_partner_id: string
          id?: string
          order_assignment_id: string
          order_id: string
          reason: Database["public"]["Enums"]["undelivery_reason"]
          reason_notes?: string | null
          return_completed_at?: string | null
          return_initiated_at?: string | null
          return_received_by?: string | null
          undelivered_at?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          delivery_partner_id?: string
          id?: string
          order_assignment_id?: string
          order_id?: string
          reason?: Database["public"]["Enums"]["undelivery_reason"]
          reason_notes?: string | null
          return_completed_at?: string | null
          return_initiated_at?: string | null
          return_received_by?: string | null
          undelivered_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "undelivery_logs_delivery_partner_id_fkey"
            columns: ["delivery_partner_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "undelivery_logs_order_assignment_id_fkey"
            columns: ["order_assignment_id"]
            isOneToOne: false
            referencedRelation: "order_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "undelivery_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          is_withdrawable: boolean | null
          reference_id: string | null
          source_user_id: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          is_withdrawable?: boolean | null
          reference_id?: string | null
          source_user_id?: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          is_withdrawable?: boolean | null
          reference_id?: string | null
          source_user_id?: string | null
          type?: Database["public"]["Enums"]["wallet_transaction_type"]
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          purchase_only_balance: number | null
          updated_at: string
          user_id: string
          withdrawable_balance: number | null
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          purchase_only_balance?: number | null
          updated_at?: string
          user_id: string
          withdrawable_balance?: number | null
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          purchase_only_balance?: number | null
          updated_at?: string
          user_id?: string
          withdrawable_balance?: number | null
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_hierarchy: {
        Row: {
          email: string | null
          full_name: string | null
          id: string | null
          purchase_only_balance: number | null
          referral_count: number | null
          referred_by: string | null
          referred_by_email: string | null
          referred_by_name: string | null
          total_wallet_balance: number | null
          user_level: Database["public"]["Enums"]["user_level"] | null
          withdrawable_balance: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "user_hierarchy"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_wallet_transaction: {
        Args: {
          p_amount: number
          p_description?: string
          p_reference_id?: string
          p_type: Database["public"]["Enums"]["wallet_transaction_type"]
          p_user_id: string
        }
        Returns: string
      }
      adjust_store_inventory_delta: {
        Args: { p_delta: number; p_product_id: string; p_store_id: string }
        Returns: number
      }
      admin_adjust_wallet: {
        Args: {
          p_amount: number
          p_bucket: string
          p_direction: string
          p_reason: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_delete_order: { Args: { p_order_id: string }; Returns: boolean }
      admin_record_registration_payment: {
        Args: {
          p_amount: number
          p_method?: string
          p_notes?: string
          p_reference?: string
          p_user_id: string
        }
        Returns: Json
      }
      count_paid_order_sales: { Args: { p_order_id: string }; Returns: boolean }
      create_notification: {
        Args: {
          p_message: string
          p_reference_id?: string
          p_reference_type?: string
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: string
      }
      credit_founder_commission: {
        Args: { p_new_user_id: string }
        Returns: undefined
      }
      credit_pending_referral_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      credit_purchase_commission: {
        Args: { p_order_total: number; p_user_id: string }
        Returns: boolean
      }
      deduct_paid_order_stock: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      ensure_user_wallet: { Args: { p_user_id: string }; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      generate_referral_code: { Args: never; Returns: string }
      generate_user_referral_code: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_homepage_product_sections: { Args: never; Returns: Json }
      get_network_admin_stats: { Args: never; Returns: Json }
      get_network_roots: {
        Args: never
        Returns: {
          email: string
          full_name: string
          referral_count: number
          referred_by: string
          user_id: string
          user_level: string
        }[]
      }
      get_top_referrers: {
        Args: { p_limit?: number }
        Returns: {
          email: string
          full_name: string
          id: string
          referral_count: number
          user_level: Database["public"]["Enums"]["user_level"]
        }[]
      }
      get_user_dashboard_details: { Args: { p_user_id: string }; Returns: Json }
      get_user_downline: {
        Args: { p_user_id: string }
        Returns: {
          email: string
          full_name: string
          level_depth: number
          referred_by: string
          user_id: string
          user_level: Database["public"]["Enums"]["user_level"]
        }[]
      }
      get_user_mlm_setting: {
        Args: { _key: string; _user_id: string }
        Returns: Json
      }
      get_withdrawal_requests_admin: {
        Args: never
        Returns: {
          amount: number
          bank_account_holder: string
          bank_account_number: string
          bank_ifsc: string
          bank_name: string
          created_at: string
          id: string
          notes: string
          paid_at: string
          payment_method: string
          payment_reference: string
          processed_at: string
          profile_email: string
          profile_full_name: string
          status: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_any_admin: { Args: { _user_id: string }; Returns: boolean }
      is_founding_member: { Args: { _user_id: string }; Returns: boolean }
      is_mlm_admin: { Args: { _user_id: string }; Returns: boolean }
      is_order_assigned_to_partner: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      issue_order_invoice: { Args: { p_order_id: string }; Returns: string }
      issue_registration_invoice: {
        Args: { p_payment_id: string }
        Returns: string
      }
      next_invoice_number: { Args: { p_type: string }; Returns: string }
      notify_admins: {
        Args: {
          p_message: string
          p_reference_id?: string
          p_reference_type?: string
          p_title: string
          p_type?: string
        }
        Returns: undefined
      }
      owns_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      pay_order_with_wallet: {
        Args: { p_amount: number; p_order_id: string }
        Returns: Json
      }
      place_order_atomic: {
        Args: {
          p_coupon_code?: string
          p_fulfillment_type?: string
          p_idempotency_key?: string
          p_items: Json
          p_payment_method?: string
          p_pickup_store_id?: string
          p_preferred_delivery_date?: string
          p_preferred_delivery_slot_id?: string
          p_shipping_address: Json
          p_use_wallet?: boolean
          p_user_id: string
        }
        Returns: Json
      }
      process_mlm_referral: {
        Args: {
          p_referral_code: string
          p_referred_user_id: string
          p_registration_fee?: number
        }
        Returns: undefined
      }
      process_referral_incentive: {
        Args: { p_referral_code: string; p_referred_user_id: string }
        Returns: boolean
      }
      process_withdrawal: {
        Args: {
          p_admin_id?: string
          p_notes?: string
          p_paid_at?: string
          p_payment_method?: string
          p_payment_reference?: string
          p_request_id: string
          p_status: string
        }
        Returns: Json
      }
      request_withdrawal: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "founding_member"
        | "member"
        | "delivery_partner"
        | "mlm_admin"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
        | "undelivered"
        | "return_initiated"
        | "return_in_transit"
        | "returned"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      undelivery_reason:
        | "customer_unavailable"
        | "wrong_address"
        | "customer_refused"
        | "payment_issue"
        | "incomplete_address"
        | "area_inaccessible"
        | "customer_rescheduled"
        | "other"
      user_level: "founder" | "master" | "associate"
      wallet_transaction_type:
        | "credit"
        | "debit"
        | "referral_bonus"
        | "purchase"
        | "refund"
        | "add_money"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "founding_member",
        "member",
        "delivery_partner",
        "mlm_admin",
      ],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "undelivered",
        "return_initiated",
        "return_in_transit",
        "returned",
      ],
      payment_status: ["pending", "completed", "failed", "refunded"],
      undelivery_reason: [
        "customer_unavailable",
        "wrong_address",
        "customer_refused",
        "payment_issue",
        "incomplete_address",
        "area_inaccessible",
        "customer_rescheduled",
        "other",
      ],
      user_level: ["founder", "master", "associate"],
      wallet_transaction_type: [
        "credit",
        "debit",
        "referral_bonus",
        "purchase",
        "refund",
        "add_money",
      ],
    },
  },
} as const
